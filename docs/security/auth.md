# Authentification

Mise en œuvre de §6.2 et d'[ADR-002](../adr/ADR-002-authentification-proprietaire.md), exigence EX-103. Le lot 1.3 est livré en trois parties :

| Partie | Contenu                                                                                      | État        |
| ------ | -------------------------------------------------------------------------------------------- | ----------- |
| 1.3a   | Comptes : inscription, confirmation d'email, réinitialisation, vérification des identifiants | Ce document |
| 1.3b   | Connexion, JWT d'accès, rafraîchissement par rotation, sessions listées et révocables        | Ce document |
| 1.3ca  | Limitation de débit des routes, anti-robot de l'inscription, `TRUST_PROXY`                   | Ce document |
| 1.3cb  | 2FA TOTP                                                                                     | Ce document |
| 1.3cc  | OTP SMS ; levée du refus de `FEATURE_AUTH` en production                                     | Ce document |

Les routes sont montées seulement avec `FEATURE_AUTH=true`. Le refus inconditionnel en production est levé (1.3cc) au profit de conditions de configuration ; le drapeau y reste éteint jusqu'à D-083.

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
- **Durée plancher** : ces deux routes ne répondent qu'après 3 500 ms (plus long délai d'abandon entre HaveIBeenPwned, 1,5 s, et reCAPTCHA, 3 s, appelés en parallèle, + 500 ms ; 2 000 ms avant le lot 1.3ca), succès comme échec : le pire cas de l'inscription tient sous le plancher, et la durée ne trahit pas le verdict anti-robot. Le travail coûteux (Argon2, base) se fait dans les deux cas.
- **Emails envoyés après la réponse** : la durée de la réponse ne dépend pas du serveur SMTP. Un échec d'envoi est journalisé (`auth.mail.failed`, type d'email et code système comme `ESOCKET` ou `EAUTH`) sans le message d'erreur ni la réponse SMTP, qui peuvent citer l'adresse.
- **Vérification des identifiants** (`CredentialsService.verify`, utilisée par la connexion en 1.3b) : compte inconnu ou supprimé → Argon2 sur un hash factice (`dummyPasswordHash()`, calculé une fois aux paramètres courants) ; résultat unique `invalid` pour un compte inconnu, supprimé, suspendu, clos ou sans mot de passe, ou un mot de passe faux. `email_unverified` n'est rendu qu'après un mot de passe juste (EX-103 n° 9). Test CP-28 : 50 essais de chaque côté, écart des médianes inférieur à 25 % (le plan visait 10 % ; seuil relâché pour le bruit des conteneurs de test, écart au plan consigné).

## Délai exponentiel (EX-103 n° 8)

- Par compte : après 3 échecs, 1 s d'attente, puis le double à chaque nouvel échec (2^(n−3) s), plafonné à 900 s ; jamais de verrouillage définitif. Pendant le délai, `retry_later` est rendu sans évaluer le mot de passe ; un succès remet le compteur à zéro.
- Compteurs Redis `oz:auth:failures:<HMAC-SHA-256(AUTH_HMAC_KEY, email normalisé)>` (champs `failures` et `last`), expirés 24 h après le dernier échec : aucune adresse en clair dans Redis. Chaque tentative est réservée par un script Redis atomique avant l'évaluation du mot de passe (comptée comme échec, effacée par un succès) : des requêtes parallèles n'évaluent pas plus de mots de passe que le délai n'en permet (testé). Un compteur illisible vaut zéro ; Redis indisponible fait échouer la vérification (erreur 500, jamais d'accès accordé).
- Le délai exponentiel reste appliqué en plus de la limitation de débit par IP et par compte (lot 1.3ca, ci-dessous).

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

| Variable                     | Rôle                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `FEATURE_AUTH`               | Monte les routes ; en production, soumis aux conditions du lot 1.3cc et éteint jusqu'à D-083 |
| `APP_URL`                    | Base des liens des emails (`https` hors local)                                               |
| `SMTP_HOST`, `SMTP_PORT`     | Serveur d'envoi                                                                              |
| `SMTP_USER`, `SMTP_PASSWORD` | Par paire ; exigés hors local                                                                |
| `EMAIL_FROM`                 | Expéditeur (`Nom <adresse>` ou adresse)                                                      |
| `AUTH_HMAC_KEY`              | Clé des empreintes d'email dans Redis, 32 caractères au moins (`openssl rand -base64 32`)    |

Les valeurs sensibles restent vides dans `.env.example` ; elles sont exigées dès que `FEATURE_AUTH=true`.

## Sessions (lot 1.3b)

Décisions validées : D1 rafraîchissement de 30 jours glissants, plafond absolu de 90 jours par famille ; D2 révocation immédiate, la famille est relue à chaque requête ; D3 réutilisation stricte, sans fenêtre de grâce ; D4 parcours E2E par l'API ; D5 email « nouvel appareil » et alerte de réutilisation.

### Jetons

- **Accès** (`@oz/auth`, `AccessTokens`) : JWT HS256 (`jose`), 15 min, claims `sub` (utilisateur), `sid` (famille de sessions), `iat`, `exp`, `jti`, `iss=oz-api`, `aud=oz`, en-tête `typ: JWT` ; ni rôle ni âge (§6.7). Vérification : algorithme imposé, émetteur, audience, âge maximal, claims exigés au format UUID, tolérance d'horloge de 30 s, jeton de 1 024 caractères au plus. Rendu dans le corps uniquement, gardé en mémoire par le client.
- **Rafraîchissement** : 32 octets aléatoires en base64url, stocké par empreinte HMAC-SHA-256 (`JWT_REFRESH_SECRET`). Cookie `__Host-oz_refresh` : `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, sans `Domain`, `Max-Age` = durée restante de la session (bornée par la famille).
- Les deux secrets font au moins 64 octets, diffèrent l'un de l'autre et sont exigés dès que `FEATURE_AUTH=true`.

### Routes

| Route                       | Authentification                   | Réponse                                                                                             |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /auth/login`          | Identifiants                       | 200 `{accessToken, expiresIn}` + cookie ; 401 générique ; 403 email à confirmer ; 429 `Retry-After` |
| `POST /auth/refresh`        | Cookie + `Origin` en liste blanche | 200 nouveau couple ; 401 `AUTH_UNAUTHENTICATED` (cookie effacé) ; 403 origine refusée               |
| `POST /auth/logout`         | Cookie + `Origin` en liste blanche | 204, même sans cookie ; famille révoquée, cookie effacé                                             |
| `GET /auth/sessions`        | `Authorization: Bearer`            | Sessions actives : appareil, IP tronquée, ouverture, dernier usage, `current`                       |
| `DELETE /auth/sessions/:id` | `Authorization: Bearer`            | 204 ; 404 `AUTH_SESSION_NOT_FOUND` si la session n'est pas active ou appartient à un autre compte   |
| `POST /auth/logout-all`     | `Authorization: Bearer`            | 204 ; toutes les familles révoquées, cookie effacé                                                  |

- **Connexion** : même durée plancher que l'inscription, corps et statut identiques pour un compte inconnu, supprimé, suspendu ou un mot de passe faux (test CP-28 : 50 essais par cas, écart des médianes inférieur à 25 %).
- **Contrefaçon de requête** : le rafraîchissement et la déconnexion, seuls à lire le cookie, exigent un en-tête `Origin` de la liste `CORS_ORIGINS` (absent : refusé), en plus de `SameSite=Strict`. Les routes de sessions ne lisent que l'en-tête `Authorization`, qu'un navigateur n'envoie jamais d'office.
- **Identifiant de session** : la famille, stable malgré les rotations (l'identifiant de ligne change toutes les 15 minutes).
- **Garde** (`AccessTokenGuard`) : jeton valide, puis, en base et à chaque requête, famille active et compte actif, non supprimé et vérifié (`sessionAccess`). Tout refus : 401 `AUTH_UNAUTHENTICATED` au corps identique ; seul un email redevenu non vérifié (changement d'adresse) donne 403 `AUTH_EMAIL_UNVERIFIED`.
- **IP** : une IPv4 reçue en notation mappée (`::ffff:a.b.c.d`) est ramenée en IPv4, puis tronquée en /24 (/48 pour IPv6) par la base. Derrière un mandataire, `trust proxy` reste à régler (DEBT D-070).

### Rotation et réutilisation

- Chaque rafraîchissement consomme la ligne (motif `rotated`) et en crée une dans la même famille, d'échéance `min(maintenant + 30 jours, plafond de la famille)`.
- Un jeton déjà consommé présenté alors que la famille vit encore : toute la famille est révoquée (`reuse_detected`, audit `user.session.reuse_detected`), réponse 401 identique à un jeton inconnu, et alerte email au titulaire. Deux onglets qui rafraîchissent en même temps déclenchent ce cas (D3) : le client web devra sérialiser ses rafraîchissements.
- Concurrence : la rotation lit la ligne sans verrou, prend le verrou consultatif de la famille, puis relit la ligne `FOR UPDATE`. Rejeu contre rotation, déconnexion contre rotation et révocation globale contre rotation sont testés.

### Notifications (D5)

- **Nouvel appareil** : à la connexion, si aucun libellé identique n'a ouvert de session du compte depuis 90 jours (familles `reuse_detected` exclues : un appareil vu dans une famille volée ne devient pas « connu »). Un client sans User-Agent reconnu porte le libellé « Appareil non identifié » et n'est signalé qu'une fois.
- **Activité suspecte** : à chaque réutilisation détectée.
- Envoyés après la réponse (`MailDispatcher`, partagé avec le lot 1.3a) ; ni jeton, ni IP, ni User-Agent brut ; lien vers la page de réinitialisation (une page de sessions n'existe pas encore, DEBT D-072). Aucun plafond d'envois par compte avant la limitation de débit du lot 1.3c (DEBT D-067).

### Chemin privilégié

Migration `20261030100000_auth_sessions`, détail dans [docs/db/migrations.md](../db/migrations.md#sessions-lot-13b).

| Fonction                 | Appelant (API)                          | Contrôle                                                                                                           | Audit                                                   |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `oz_auth_open_session`   | `SessionService.login`                  | Compte actif, vérifié, non supprimé ; empreinte, durées (1 à 30 jours, famille ≤ 90 jours) ; IP tronquée en base   | `user.session.opened`                                   |
| `oz_auth_rotate_session` | `SessionService.refresh`                | Verrou de famille ; ligne active, non expirée, compte pouvant tenir une session ; réutilisation → famille révoquée | `user.session.reuse_detected` (réutilisation seulement) |
| `oz_auth_logout`         | `SessionService.logout`                 | Verrou de famille ; ligne active ou consommée (`rotated`)                                                          | `user.session.revoked`                                  |
| `oz_auth_reset_password` | `AuthService.resetPassword` (remplacée) | Celui du lot 1.3a ; familles verrouillées dans l'ordre, motif `password_reset`                                     | `user.password.reset`                                   |

Sous contexte utilisateur (`withUserContext`, RLS et garde `oz_sessions_guard`) : `listSessions`, `revokeSession` (audit `user.session.revoked`), `revokeAllSessions` (audit `user.session.logout_all`), `sessionAccess`, `accountEmail`.

### Configuration

| Variable             | Rôle                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `JWT_ACCESS_SECRET`  | Clé HS256 des jetons d'accès, 64 octets au moins en base64 (`openssl rand -base64 64`)     |
| `JWT_REFRESH_SECRET` | Clé HMAC des empreintes de rafraîchissement, 64 octets au moins, différente de la première |
| `JWT_ACCESS_TTL`     | `15m` seulement                                                                            |
| `JWT_REFRESH_TTL`    | De `1d` à `30d` (défaut `30d`)                                                             |

## Limitation de débit (lot 1.3ca, EX-T18)

Décisions validées : D1 limiteur maison dans Redis ; D2 limites réglables sans redéploiement ; D3 Redis indisponible → refus (500) ; D7 valeurs et clés ci-dessous. Écart d'exécution à D1 : **journal glissant exact** (ensemble trié des passages acceptés, horloge du serveur Redis, script Lua atomique) au lieu de deux compteurs approchés ; la mémoire par clé reste bornée par la limite (1 000 au plus).

| Règle              | Route                             | Compte                            | Défaut     |
| ------------------ | --------------------------------- | --------------------------------- | ---------- |
| `login_ip`         | `POST /auth/login`                | IP                                | 5 / 15 min |
| `login_account`    | `POST /auth/login`                | adresse saisie (existante ou non) | 10 / 1 h   |
| `register_ip`      | `POST /auth/register`             | IP                                | 3 / 1 h    |
| `register_email`   | `POST /auth/register`             | adresse, demande recevable seule  | 1 / 1 h    |
| `register_form_ip` | `GET /auth/register/form`         | IP                                | 20 / 1 h   |
| `forgot_ip`        | `POST /auth/password/forgot`      | IP                                | 3 / 1 h    |
| `forgot_email`     | `POST /auth/password/forgot`      | adresse saisie                    | 1 / 15 min |
| `verify_email_ip`  | `POST /auth/verify-email`         | IP                                | 10 / 1 h   |
| `reset_ip`         | `POST /auth/password/reset`       | IP                                | 10 / 1 h   |
| `refresh_ip`       | `POST /auth/refresh`              | IP                                | 60 / 1 min |
| `new_device_email` | email « nouvelle connexion » (D5) | compte                            | 3 / 24 h   |

- **Refus** : 429 `RATE_LIMITED`, en-tête `Retry-After` en secondes (temps jusqu'à ce qu'une place se libère, juste aussi après une limite abaissée — propriété testée), documenté dans OpenAPI sur chaque route. Le délai exponentiel garde son code `AUTH_RETRY_LATER`.
- **Ordre** : la garde `@RateLimit` passe avant la validation (une requête invalide compte), règle IP d'abord, et s'arrête au premier refus : une IP déjà bloquée n'épuise pas le compteur d'un compte. `register_email` est compté dans le service, après HaveIBeenPwned : un mot de passe refusé ne bloque pas la tentative corrigée ; il l'est aussi pour un robot, pour que le 429 ne révèle pas le verdict. Au-delà du plafond `new_device_email`, la connexion réussit, l'email n'est pas envoyé (`auth.mail.capped`).
- **Clés** : `oz:rl:<règle>:<HMAC-SHA-256(AUTH_HMAC_KEY, règle et sujet)>` : ni IP ni adresse en clair dans Redis. Adresse normalisée comme le contrat (espaces retirés, minuscules) ; IPv4 entière, IPv6 par /64, IPv4 mappée (toutes écritures) ramenée en IPv4 ; IP illisible → 400 `CLIENT_UNIDENTIFIED`, jamais de compteur commun.
- **Réglage** : `system_settings`, clé `rate_limits`, objet partiel `{ "<règle>": { "limit": n, "windowSeconds": s } }` fusionné avec les défauts, relu au plus toutes les 30 s (une seule lecture à la fois). Entier de 1 à 1 000, fenêtre de 1 s à 7 jours, aucune clé inconnue : sinon tout le réglage est ignoré (`rate_limit.settings_invalid`). Base illisible → défauts (`rate_limit.settings_unavailable`). Écriture par SQL d'ici le back-office (lot 1.11) :

  ```sql
  INSERT INTO system_settings (key, value) VALUES ('rate_limits', '{"login_ip": {"limit": 10, "windowSeconds": 900}}')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ```

- **Redis** : les clés `oz:rl:*` ne doivent pas être évincées (une éviction vaut un passage accordé) : politique `maxmemory-policy` `noeviction` ou `volatile-*` à vérifier avec la recette (D-051).
- **Mandataires** : `TRUST_PROXY` = nombre de sauts de confiance devant l'API (0 en accès direct, 2 pour Cloudflare puis Traefik). La confiance par nombre de sauts suppose que l'origine n'est joignable que par ces mandataires (pare-feu limité aux plages Cloudflare) et que Traefik conserve `X-Forwarded-For` (`forwardedHeaders.trustedIPs` aux plages Cloudflare) : sinon un client choisit son IP. À poser avec la recette (D-051).

## 2FA TOTP (lot 1.3cb)

Second facteur RFC 6238 (EX-103 n° 7, D1 à D8 du plan), par `otplib` : SHA-1, 6 chiffres, 30 s, tolérance d'un pas de part et d'autre. Obligatoire pour les rôles `admin`, `center` et `federation`, facultatif ailleurs. Aucun écran avant le lot 1.7.

### Routes

| Route                           | Accès         | Effet                                                                                        |
| ------------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| `POST /auth/login`              | public        | Si la 2FA est active : `{ status: '2fa_required', challengeToken, expiresIn }`, sans session |
| `POST /auth/login/2fa`          | défi          | Code TOTP ou de secours : ouvre la session. Défi inconnu, épuisé ou code faux : même 401     |
| `POST /auth/2fa/setup`          | jeton d'accès | Crée un secret en attente, rend secret, URI et QR                                            |
| `POST /auth/2fa/enable`         | jeton d'accès | Active avec un premier code, rend dix codes de secours. Déjà active : `currentCode` exigé    |
| `POST /auth/2fa/disable`        | jeton d'accès | Mot de passe et code ; refusée si un rôle impose la 2FA                                      |
| `POST /auth/2fa/recovery-codes` | jeton d'accès | Code TOTP exigé ; nouveau lot, l'ancien cesse de valoir, email envoyé                        |

### Règles

- **Secret** : chiffré par `oz_encrypt` avec `DATABASE_ENCRYPTION_KEY`, exigée dès `FEATURE_AUTH=true`, local compris. Jamais journalisé ; la réponse d'enrôlement n'est pas mise en cache.
- **Anti-rejeu** : `users.totp_last_step`, mis à jour atomiquement. Un code déjà accepté est refusé, même avec un nouveau défi.
- **Défi** : jeton opaque de 256 bits dans Redis, 5 minutes, 5 essais, usage unique à la réussite, invalidé par un changement de mot de passe. Redis garde une empreinte HMAC du jeton, l'identifiant du compte et le libellé d'appareil, aucune adresse.
- **Indiscernabilité** : le défi n'apparaît qu'après un mot de passe juste. Aucun cookie, aucune session, aucun email « nouvel appareil » avant le second facteur.
- **Codes de secours** : 10 codes de 80 bits, montrés une fois, conservés en empreinte HMAC (`AUTH_HMAC_KEY`). Chaque usage envoie une alerte.
- **Rôle obligatoire sans 2FA** : session restreinte. `AccessTokenGuard` répond 403 `AUTH_2FA_ENROLLMENT_REQUIRED` hors routes marquées `@TwoFactorEnrollment()` (enrôlement, déconnexion). Rôles relus en base à chaque requête ; une route nouvelle est fermée par défaut.
- **Changement d'état** : activation et désactivation révoquent les autres sessions (motif `two_factor_changed`) et envoient un email. La session courante reste.
- **Réinitialisation du mot de passe** : ne touche pas à la 2FA.

### Débit

| Règle                 | Sujet  | Défaut      |
| --------------------- | ------ | ----------- |
| `login_totp_ip`       | IP     | 10 / 15 min |
| `login_totp_account`  | compte | 5 / 15 min  |
| `totp_setup_ip`       | IP     | 10 / 1 h    |
| `totp_enroll_account` | compte | 10 / 1 h    |

Les codes faux passent aussi par le délai exponentiel de la connexion, sur un compteur à part qu'un mot de passe juste n'efface pas.

## Vérification du téléphone (lot 1.3cc)

Prouve la possession d'un numéro (EX-111 n° 2, TD-012). Le KYC 1 du lot 1.10 lira `users.phone_verified_at`. Aucun écran avant le lot 1.7. Aucun appel réel n'a été fait aux fournisseurs (D-082).

### Routes

| Route                     | Accès         | Effet                                                                                    |
| ------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `POST /auth/phone/start`  | jeton d'accès | 202 `{expiresIn, resendAfter}`. Envoi après la réponse ; `channel: 'sms'` saute WhatsApp |
| `POST /auth/phone/verify` | jeton d'accès | 204 : numéro et date écrits. Code faux, expiré ou épuisé : même 422 `PHONE_CODE_INVALID` |

Pas d'exemption 2FA : un compte à 2FA obligatoire non enrôlé reçoit 403 `AUTH_2FA_ENROLLMENT_REQUIRED`.

### Règles

- **Code** : 6 chiffres (`crypto.randomInt`), 5 min, 5 essais, usage unique, un seul code vivant par compte. Renvoi après 60 s.
- **Redis** : empreinte HMAC du code liée au compte, clés empreintes. Essai et consommation tiennent dans un seul script Lua : un code dépassé par un nouvel envoi ne passe jamais. Le numéro y attend, scellé en AES-256-GCM (clé dérivée de `AUTH_HMAC_KEY`, compte en donnée associée) : il n'existe en base qu'une fois prouvé.
- **Base** : `phone_encrypted` et `phone_hmac`, écrits par `oz_auth_set_verified_phone` seule. Pas d'unicité : un numéro peut être partagé (tuteur, famille) ; l'empreinte servira au contrôle de doublon du KYC.
- **Changement** : l'ancien numéro reste vérifié jusqu'au code juste. Remplacer un numéro vérifié envoie une alerte par email, sans le numéro.
- **Numéros** : E.164 strict et liste blanche `SMS_ALLOWED_PREFIXES` (défaut `+237`), parade au pompage de SMS. Hors liste : 422 `PHONE_COUNTRY_UNSUPPORTED`, avant tout envoi ; seul `otp_start_ip` est compté.

### Envoi

Chaîne de `SmsChain` : Infobip WhatsApp, Infobip SMS, Twilio SMS. Bascule sur erreur ou délai (5 s par essai) de l'appel API, dans `SmsDispatcher`, en mémoire et attendu à l'arrêt (D-081). Sans accusé de réception, un WhatsApp accepté et jamais livré ne bascule pas seul : l'utilisateur renvoie avec `channel: 'sms'` (D-080).

Journal : `auth.otp.sent` et `auth.otp.failed`, avec canal, fournisseur et codes d'échec. Jamais le numéro, le code ni le corps d'une réponse.

Le fournisseur factice écrit le code sur la sortie standard. Il n'est permis qu'avec `APP_ENV=local`.

### Débit

| Règle                | Clé    | Limite      |
| -------------------- | ------ | ----------- |
| `otp_start_ip`       | IP     | 10 / 1 h    |
| `otp_start_account`  | compte | 3 / 15 min  |
| `otp_start_phone`    | numéro | 5 / 24 h    |
| `otp_verify_ip`      | IP     | 20 / 15 min |
| `otp_verify_account` | compte | 10 / 1 h    |

### Configuration

`SMS_PROVIDER_PRIMARY` (`fake` ou `infobip`), `SMS_PROVIDER_FALLBACK` (`twilio`), `INFOBIP_*`, `TWILIO_*`, `SMS_ALLOWED_PREFIXES`. Hors local, avec `FEATURE_AUTH=true`, Infobip et Twilio complets sont exigés et le factice est refusé. En recette et en production, `TRUST_PROXY` doit aussi être non nul : sans lui, toutes les IP n'en font qu'une pour les limites. `DATABASE_BLIND_INDEX_KEY` est exigée dès `FEATURE_AUTH=true`.

## Anti-robot de l'inscription (lot 1.3ca)

Décisions validées : D4 reCAPTCHA v3 ; D5 robot → même 202, rien de créé ni d'envoyé ; D6 jeton de formulaire signé et champ piège.

- **Jeton de formulaire** : `GET /auth/register/form` → `{formToken}` (`Cache-Control: no-store`, limité par IP). 8 octets d'horodatage et 16 d'aléa signés par HMAC-SHA-256 (`AUTH_HMAC_KEY`, domaine séparé), comparaison à temps constant ; aucune donnée personnelle. `POST /auth/register` l'exige (422 sinon) et ne l'accepte qu'âgé de 3 s à 2 h.
- **Champ piège** `website` : invisible pour un humain, absent ou vide.
- **reCAPTCHA v3** (`recaptchaToken`) : `siteverify` en POST, sans l'IP du client ; action `register`, nom d'hôte d'`APP_URL`, score ≥ `RECAPTCHA_MIN_SCORE`. Délai 3 s ; panne, délai ou réponse illisible → inscription acceptée, `auth.recaptcha.unavailable` (piège, chronométrie et débit restent actifs). Secret refusé par Google : `auth.recaptcha.misconfigured` (erreur). Sans secret (local seulement) : vérification sautée, `auth.recaptcha.disabled` au démarrage. Avec un secret, une inscription sans `recaptchaToken` est traitée en robot (`recaptcha_missing`) : hors local, aucune inscription n'aboutit avant l'écran du lot 1.7 (DEBT D-076).
- **Robot** (piège rempli, jeton absent du bon âge ou invalide, verdict reCAPTCHA) : 202 `{status: 'accepted'}`, dans la même durée plancher ; ni compte, ni email. Le contrôle HaveIBeenPwned (422) et la limite par adresse (429) s'appliquent avant le verdict, comme pour un humain : la réponse ne dit jamais au robot qu'il a été détecté ; `auth.bot.rejected` avec le seul motif (`honeypot`, `form_too_fast`, `form_expired`, `form_invalid`, `recaptcha_<motif>`). Durée humain / robot : écart des médianes inférieur à 25 % (testé).

### Configuration

| Variable               | Rôle                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `TRUST_PROXY`          | Sauts de mandataires de confiance, de 0 (défaut) à 5                       |
| `RECAPTCHA_SECRET_KEY` | Secret serveur reCAPTCHA v3 ; exigé hors local quand `FEATURE_AUTH=true`   |
| `RECAPTCHA_MIN_SCORE`  | Score minimal d'un humain, de 0 à 1, deux décimales au plus (défaut `0.5`) |
