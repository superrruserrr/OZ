# ADR-010 : Session du site web par relais serveur

Statut : Accepté
Date : 2026-11-10 · Décideurs : Gaëtan Wassu

## Contexte

Les écrans d'inscription (lot 1.7c, EX-107) sont les premiers écrans connectés du site. L'API rend
un jeton d'accès de 15 minutes dans le corps de la réponse et pose le jeton de rafraîchissement en
cookie `__Host-oz_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`) ; l'ADR-002 prévoyait un
jeton d'accès gardé en mémoire par le client.

Deux contraintes du site empêchent le navigateur d'appeler l'API directement :

- la CSP du site limite `connect-src` à `'self'` (plan §6.5) ; l'ouvrir élargit la surface d'une
  injection de script ;
- un cookie `__Host-` n'a pas d'attribut `Domain` : posé par l'API sur son propre domaine, il n'est
  jamais lisible par le site, et l'inverse.

Sources : ADR-002 ; TD-005 ; `requirements.md` EX-103, EX-107 ; plan §6.2 et §6.5 ;
`docs/security/auth.md`.

## Options envisagées

1. **Relais par le serveur du site** — les actions serveur Next et `proxy.ts` appellent l'API ; les
   deux jetons sont gardés en cookies `HttpOnly` posés par le site. Avantages : aucun jeton lisible
   par le JavaScript du navigateur, CSP inchangée, pas de CORS à ouvrir, même origine pour toutes
   les requêtes du navigateur. Inconvénients : un saut réseau de plus ; le site doit transmettre
   l'adresse IP du client pour que les limites de débit de l'API restent par personne.
2. **CSP ouverte à l'API** — le navigateur appelle l'API (domaine ajouté à `connect-src`, CORS avec
   identifiants), jeton d'accès en mémoire. Avantages : conforme à la lettre de l'ADR-002.
   Inconvénients : jeton d'accès exposé à une injection de script, CORS avec identifiants et jeton
   CSRF à maintenir, cookie de rafraîchissement sur un autre domaine que le site.

## Décision

Option 1.

- **Cookies du site**, tous `HttpOnly; Secure; SameSite=Strict; Path=/`, préfixe `__Host-` :
  - `__Host-oz_access` : jeton d'accès, `Max-Age` égal à sa durée de vie (`expiresIn`, 900 s) ;
  - `__Host-oz_refresh` : copie exacte (valeur et durée) du cookie émis par l'API, renvoyée à
    l'API seulement sur `/auth/refresh` et `/auth/logout` ;
  - `__Host-oz_2fa` : défi du second facteur, 300 s, effacé dès la fin de la connexion.
- **Renouvellement** dans `proxy.ts`, seul endroit où une page peut encore poser des cookies avant
  le rendu : sur une route protégée, jeton d'accès absent ou à moins de 60 s de l'échéance et
  rafraîchissement présent → `POST /auth/refresh`. Un refus (401) efface les cookies et renvoie à la
  connexion ; une panne (5xx, délai) n'efface rien, comme l'API. Les pages publiques n'appellent
  jamais l'API pour la session.
- **CSRF** : `SameSite=Strict` sur tous les cookies, contrôle d'origine natif des actions serveur
  Next, et en-tête `Origin` du site transmis à `/auth/refresh` et `/auth/logout` (liste blanche
  `CORS_ORIGINS` de l'API, qui doit donc contenir l'origine publique du site).
- **Adresse du client** : le site transmet `X-Forwarded-For` tel que reçu, sans y ajouter sa propre
  entrée, et `User-Agent`. Pour l'API, le site prend simplement la place du dernier mandataire :
  `TRUST_PROXY` reste le nombre de mandataires qui ajoutent une entrée devant le site (Cloudflare puis
  Traefik : 2, `docs/security/auth.md`), sans compter le site. Le compter laisserait le client choisir
  son adresse en forgeant l'en-tête et contourner les limites par IP (CP-28). Le site n'est joignable
  que par ces mandataires.
- **Code serveur seulement** : le client de l'API du site (`apps/web/src/session/`) importe
  `server-only` ; aucun jeton n'est rendu dans le HTML, les props d'un composant client ni les
  journaux.
- **reCAPTCHA v3** : script chargé seulement si `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` est définie ; la
  CSP n'est alors étendue qu'aux domaines exigés par Google (`www.google.com`, `www.gstatic.com`).
  Sans clé, la CSP est identique.
- L'ADR-002 reste valable pour l'API et l'application mobile (Phase 2, stockage sécurisé natif) ;
  seul le stockage du jeton d'accès par le site web change.

## Conséquences

- Le contrat `accessTokenOutputSchema` (« jamais dans un cookie ») vaut pour les cookies de l'API ;
  le cookie du site est posé par le serveur du site, sur son origine, et n'est pas lisible par le
  navigateur.
- Recette et production : `CORS_ORIGINS` inclut l'origine du site ; `TRUST_PROXY` inchangé (le site
  n'est pas compté) ; vérifiés lors de la mise en ligne de test (lot 0.8c).
- Deux renouvellements simultanés du même jeton (deux onglets dans la même minute) passent pour un
  rejeu et révoquent la famille : le site ne renouvelle jamais sur un préchargement, et une fenêtre
  de grâce côté API reste à décider (D-132).
- Les écrans connectés suivants (lots 1.7cb, 1.8, 1.13c…) passent par ce relais ; aucun appel du
  navigateur vers l'API n'est admis (test E2E de non-régression).
- Révision si l'application mobile ou un domaine commun site et API change la donne (cookie partagé
  par sous-domaine).
