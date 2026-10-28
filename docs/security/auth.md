# Authentification

Mise en œuvre de §6.2 et d'[ADR-002](../adr/ADR-002-authentification-proprietaire.md), exigence EX-103. Le lot 1.3 est livré en trois parties :

| Partie | Contenu                                                                                         | État        |
| ------ | ----------------------------------------------------------------------------------------------- | ----------- |
| 1.3a   | Comptes : inscription, confirmation d'email, réinitialisation, vérification des identifiants    | Ce document |
| 1.3b   | Connexion, JWT d'accès, rafraîchissement par rotation, sessions listées et révocables           | Prévue      |
| 1.3c   | 2FA TOTP, OTP SMS, anti-robot, limitation de débit par IP ; condition de `FEATURE_AUTH` en prod | Prévue      |

Les routes sont montées seulement avec `FEATURE_AUTH=true`, refusé en production jusqu'à la fin de 1.3c (sans limitation de débit ni anti-robot, elles serviraient à envoyer des emails en masse).

## Mots de passe

- **Politique** (`@oz/auth`, `password-policy.ts`) : normalisation NFKC, 12 à 128 caractères comptés en points de code, entrée bornée à 512 unités UTF-16 avant tout calcul, demi-paire de substitution isolée refusée. La validation des contrats (`@oz/contracts`, `newPassword`) applique les mêmes bornes avant tout accès à la base : réponse 422 `VALIDATION_FAILED` dont le détail porte `AUTH_PASSWORD_TOO_SHORT`, `AUTH_PASSWORD_TOO_LONG` ou `AUTH_PASSWORD_MALFORMED` (code métier attaché à la règle par `params.code`, repris par le format d'erreur de l'API) ; mot de passe compromis : 422 `AUTH_PASSWORD_BREACHED`.
- **Hachage** : Argon2id, m = 19 456 Kio, t = 2, p = 1 (recommandation OWASP), via `@node-rs/argon2`. `needsRehash` compare le préfixe PHC aux paramètres courants : un hash périmé est remplacé à la connexion suivante (`oz_auth_rehash_password`).
- **HaveIBeenPwned** (`pwned.ts`) : k-anonymité, seul le préfixe de 5 caractères de l'empreinte SHA-1 quitte le serveur, avec l'en-tête `Add-Padding: true` (les lignes de remplissage au compte `0` sont ignorées). Délai global de 1,5 s, corps limité à 200 000 caractères, lignes au format strict. **Panne ou délai : le mot de passe est accepté** (décision D1 du lot 1.3a) et l'événement `auth.pwned.unavailable` est journalisé ; le compteur se lit dans les journaux en attendant les métriques (DEBT D-069).

## Jetons à usage unique

- 32 octets aléatoires (`crypto.getRandomValues`), encodés en base64url (43 caractères). Seule l'empreinte SHA-256 en hexadécimal est stockée (`auth_tokens.token_hash`, contrainte `CHECK`).
- Durées de vie : confirmation d'email 24 h, réinitialisation 30 min (constantes de `apps/api/src/auth/auth.tokens.ts`) ; la base refuse toute durée hors de 1 min à 7 jours.
- Un jeton se consomme une fois, sous verrou de ligne (deux consommations concurrentes : une seule réussit, testé). Une nouvelle demande de réinitialisation invalide les précédentes.
- Les liens portent le jeton dans le **fragment** (`/auth/verify-email#token=…`, `/auth/reset#token=…`) : un fragment n'est jamais envoyé au serveur, il n'apparaît donc ni dans les journaux d'accès ni dans l'en-tête `Referer`. La page web le lit et l'envoie dans le corps d'un `POST`.

## Routes (lot 1.3a)

| Route                        | Réponse                                                            | Emails                                                          |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `POST /auth/register`        | 202 `{status: 'accepted'}`, que l'adresse soit libre ou déjà prise | Confirmation, ou « vous avez déjà un compte » (lien de réinit.) |
| `POST /auth/verify-email`    | 200 `{status: 'verified'}` ; sinon 400 `AUTH_TOKEN_INVALID`        | —                                                               |
| `POST /auth/password/forgot` | 202 `{status: 'accepted'}`, que le compte existe ou non            | Lien de réinitialisation si le compte existe                    |
| `POST /auth/password/reset`  | 200 `{status: 'reset'}` ; sinon 400 `AUTH_TOKEN_INVALID`           | « Mot de passe modifié »                                        |

- Un jeton invalide, expiré, déjà consommé ou d'un autre usage donne la même erreur 400.
- La réinitialisation prouve la possession de la boîte : elle pose aussi la vérification de l'email, active un compte en attente et révoque toutes les sessions du compte.
- Un compte suspendu ou clos n'est ni confirmé ni réinitialisé.

## Indiscernabilité (EX-103 n° 10, CP-28)

- Corps et statut identiques pour une adresse libre ou prise (`register`), un compte existant ou non (`forgot`).
- **Durée plancher** : ces deux routes ne répondent qu'après 2 000 ms (délai d'abandon de HaveIBeenPwned + 500 ms), succès comme échec : le pire cas de l'inscription tient sous le plancher. Le travail coûteux (Argon2, base) se fait dans les deux cas.
- **Emails envoyés après la réponse** : la durée de la réponse ne dépend pas du serveur SMTP. Un échec d'envoi est journalisé (`auth.mail.failed`, type d'email et code système comme `ESOCKET` ou `EAUTH`) sans le message d'erreur ni la réponse SMTP, qui peuvent citer l'adresse.
- **Vérification des identifiants** (`CredentialsService.verify`, utilisée par la connexion en 1.3b) : compte inconnu ou supprimé → Argon2 sur un hash factice (`dummyPasswordHash()`, calculé une fois aux paramètres courants) ; résultat unique `invalid` pour un compte inconnu, supprimé, suspendu, clos ou sans mot de passe, ou un mot de passe faux. `email_unverified` n'est rendu qu'après un mot de passe juste (EX-103 n° 9). Test CP-28 : 50 essais de chaque côté, écart des médianes inférieur à 25 % (le plan visait 10 % ; seuil relâché pour le bruit des conteneurs de test, écart au plan consigné).

## Délai exponentiel (EX-103 n° 8)

- Par compte : après 3 échecs, 1 s d'attente, puis le double à chaque nouvel échec (2^(n−3) s), plafonné à 900 s ; jamais de verrouillage définitif. Pendant le délai, `retry_later` est rendu sans évaluer le mot de passe ; un succès remet le compteur à zéro.
- Compteurs Redis `oz:auth:failures:<HMAC-SHA-256(AUTH_HMAC_KEY, email normalisé)>` (champs `failures` et `last`), expirés 24 h après le dernier échec : aucune adresse en clair dans Redis. Chaque tentative est réservée par un script Redis atomique avant l'évaluation du mot de passe (comptée comme échec, effacée par un succès) : des requêtes parallèles n'évaluent pas plus de mots de passe que le délai n'en permet (testé). Un compteur illisible vaut zéro ; Redis indisponible fait échouer la vérification (erreur 500, jamais d'accès accordé).
- Le délai par adresse IP et la limitation de débit des routes arrivent en 1.3c (DEBT D-067).

## Base de données : chemin privilégié

Migration `20261029100000_auth_comptes`, détail dans [docs/db/migrations.md](../db/migrations.md#authentification-lot-13a). Ces opérations se font sans utilisateur connecté : elles passent par des fonctions `SECURITY DEFINER` (D-059), dont `EXECUTE` est retiré à `PUBLIC` et accordé au seul rôle applicatif `oz_app`.

| Fonction                         | Appelant (API)                       | Contrôle                                                                                                 | Audit                           |
| -------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `oz_auth_register`               | `AuthService.register`               | Hash au format Argon2id, empreinte de jeton, durée bornée ; adresse prise → `NULL`, rien écrit           | `user.account.registered`       |
| `oz_auth_credentials`            | `CredentialsService.verify`          | Lecture seule ; compte non supprimé                                                                      | —                               |
| `oz_auth_verify_email`           | `AuthService.verifyEmail`            | Jeton de confirmation valide ; compte en attente ou actif                                                | `user.email.verified`           |
| `oz_auth_request_password_reset` | `AuthService.requestPasswordReset`   | Compte non supprimé, en attente ou actif ; demandes précédentes invalidées                               | `user.password.reset_requested` |
| `oz_auth_reset_password`         | `AuthService.resetPassword`          | Jeton de réinitialisation valide ; compte en attente ou actif ; sessions révoquées                       | `user.password.reset`           |
| `oz_auth_rehash_password`        | `CredentialsService.verify` (rehash) | `oz_current_user_id()` = titulaire (`withUserContext` après mot de passe vérifié) ; ancien hash inchangé | `user.password.rehashed`        |

`oz_auth_consume_token` et `oz_auth_mark_email_verified` sont internes (non `SECURITY DEFINER`, `EXECUTE` retiré à `PUBLIC`). L'audit ne contient jamais l'email, le hash ni le jeton (testé).

## Emails

- Transport SMTP (`nodemailer`, décision D2) : Mailpit en local, Scaleway TEM en prévisualisation, recette et production. Hors local, authentification SMTP, `APP_URL` en `https` et TLS exigés (STARTTLS obligatoire, ou TLS implicite sur le port 465), certificat vérifié ; en local, Mailpit sans TLS. Délais de connexion, d'accueil et de socket de 10 s.
- Gabarits texte et HTML en français, valeurs échappées, aucun lien externe ; l'adresse d'expédition (`EMAIL_FROM`) est validée au démarrage.
- Les envois vivent en mémoire jusqu'au lot 1.15 (file BullMQ). Un arrêt normal (SIGTERM) attend les envois en cours puis ferme le transport ; un arrêt brutal les perd (DEBT D-068).

## Configuration

| Variable                     | Rôle                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `FEATURE_AUTH`               | Monte les routes ; interdit à `true` en production jusqu'à 1.3c                           |
| `APP_URL`                    | Base des liens des emails (`https` hors local)                                            |
| `SMTP_HOST`, `SMTP_PORT`     | Serveur d'envoi                                                                           |
| `SMTP_USER`, `SMTP_PASSWORD` | Par paire ; exigés hors local                                                             |
| `EMAIL_FROM`                 | Expéditeur (`Nom <adresse>` ou adresse)                                                   |
| `AUTH_HMAC_KEY`              | Clé des empreintes d'email dans Redis, 32 caractères au moins (`openssl rand -base64 32`) |

Les valeurs sensibles restent vides dans `.env.example` ; elles sont exigées dès que `FEATURE_AUTH=true`.
