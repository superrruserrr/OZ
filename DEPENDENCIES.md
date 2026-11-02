# Registre des dépendances (R12)

Toute dépendance externe (racine, apps, paquets) figure ici **avant** d'être mergée : licence vérifiée, audit de vulnérabilités, poids évalué, alternative native envisagée. `pnpm lint` échoue si une dépendance déclarée n'y figure pas (`scripts/check-dependencies.mjs`).

Audit : `pnpm audit --audit-level high` — aucune vulnérabilité connue au 2026-10-26 (overrides compris) ; contrôle bloquant en CI depuis le lot 0.7 (job `security`, avec Trivy).

## Outillage (devDependencies, racine) — lot 0.1

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `typescript` | 6.0.3 (exact, catalogue pnpm) | Apache-2.0 | ≈ 23 Mo | Compilateur, TS strict (TD-001) | Aucune. TypeScript 7 écarté : non supporté par typescript-eslint (< 6.1) — voir `DEBT.md` | 0.1 |
| `turbo` | ^2.11.10 | MIT | ≈ 0,7 Mo (+ binaire) | Orchestration du monorepo, cache de build | Scripts pnpm `-r` : pas de cache ni de graphe de tâches | 0.1 |
| `eslint` | 10.13.0 (exact) | MIT | ≈ 2,8 Mo | Lint bloquant (R5) | Aucune | 0.1 |
| `@eslint/js` | 10.0.1 (exact) | MIT | ≈ 15 Ko | Règles recommandées ESLint | — | 0.1 |
| `typescript-eslint` | 8.72.0 (exact) | MIT | ≈ 41 Ko (+ sous-paquets) | Lint typé, `no-explicit-any` | Aucune | 0.1 |
| `globals` | ^17.13.0 | MIT | ≈ 250 Ko | Globales Node pour ESLint | Liste manuelle, fragile | 0.1 |
| `prettier` | 3.9.10 (exact) | MIT | ≈ 9,5 Mo | Formatage | Aucune | 0.1 |
| `@types/node` | ^24.19.2 | MIT | ≈ 2,5 Mo | Types Node (cible Node 24 LTS) | — | 0.1 |
| `husky` | 9.1.7 (exact) | MIT | ≈ 3 Ko | Hooks Git versionnés | `core.hooksPath` manuel, non installé automatiquement | 0.1 |
| `lint-staged` | ^17.6.0 | MIT | ≈ 160 Ko | Lint et format des fichiers indexés | Script maison sur `git diff --cached` | 0.1 |
| `@commitlint/cli` | ^21.2.4 | MIT | ≈ 36 Ko | Vérification Conventional Commits (§2.3) | Expression régulière dans le hook, moins précise | 0.1 |
| `@commitlint/config-conventional` | ^21.2.4 | MIT | ≈ 20 Ko | Règles Conventional Commits | — | 0.1 |
| `vitest` | ^5.0.5 | MIT | ≈ 2,7 Mo | Tests unitaires (TD-006) | `node:test` : pas de projets multiples ni d'écosystème de couverture équivalent | 0.1 |
| `@vitest/coverage-v8` | ^5.0.5 | MIT | ≈ 28 Ko | Couverture (seuils R6 en 0.7) | — | 0.1 |

## API (apps/api, packages/config) — lot 0.3

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `@nestjs/core` | ^12.2.0 | MIT | ≈ 740 Ko | Framework de l'API (TD-001), ESM natif | Express ou Fastify nus : structure modulaire à réinventer (ADR-001) | 0.3 |
| `@nestjs/common` | ^12.2.0 | MIT | ≈ 550 Ko | Décorateurs, exceptions, pipes Nest | — (indissociable de @nestjs/core) | 0.3 |
| `@nestjs/platform-express` | ^12.2.0 | MIT | ≈ 80 Ko | Adaptateur HTTP Express | @nestjs/platform-fastify : écosystème plus réduit (helmet, téléversements) | 0.3 |
| `@nestjs/swagger` | ^12.0.4 | MIT | ≈ 400 Ko (+ swagger-ui-dist) | OpenAPI et /docs (EX-T07) | Écriture manuelle du schéma OpenAPI : dérive garantie | 0.3 |
| `nestjs-pino` | ^5.3.1 | MIT | ≈ 390 Ko | Logger pino intégré à Nest, propagation du contexte | Intercepteur maison : réinvente AsyncLocalStorage et le format pino-http | 0.3 |
| `pino` | ^10.4.0 | MIT | ≈ 690 Ko | Logs JSON structurés et masquage (EX-T19) | console : ni JSON ni masquage | 0.3 |
| `pino-http` | ^11.0.0 | MIT | ≈ 80 Ko | Logs de requêtes HTTP, identifiant de requête | Middleware maison | 0.3 |
| `helmet` | ^8.3.0 | MIT | ≈ 100 Ko | En-têtes de sécurité §6.5 (EX-T17) | En-têtes posés à la main : oublis probables | 0.3 |
| `reflect-metadata` | ^0.2.2 | Apache-2.0 | ≈ 235 Ko | Métadonnées des décorateurs (injection Nest) | Aucune : requis par Nest | 0.3 |
| `rxjs` | ^7.8.2 | Apache-2.0 | ≈ 4,3 Mo | Dépendance de pair de Nest | Aucune : requis par Nest | 0.3 |
| `pg` | ^8.23.1 | MIT | ≈ 100 Ko | Sonde de santé PostgreSQL (Prisma au lot 0.6) | Prisma : pas encore en place | 0.3 |
| `ioredis` | ^6.0.0 | MIT | ≈ 1,2 Mo | Sonde de santé Redis ; client de BullMQ plus tard | node-redis : BullMQ s'appuie sur ioredis | 0.3 |
| `@aws-sdk/client-s3` | ^3.1156.0 (exact dans `packages/storage`) | Apache-2.0 | ≈ 3,2 Mo | Sonde de santé du stockage ; coffre documentaire `@oz/storage` (lot 1.9a) | Signature SigV4 maison : risque de sécurité | 0.3 |
| `zod` | ^4.6.7 | MIT | ≈ 6 Mo | Validation de la configuration ; contrats au lot 0.5 (TD-001 : 3.24+ minimum) | Validation manuelle : pas de schéma partagé client/serveur | 0.3 |
| `@nestjs/testing` | ^12.2.0 | MIT | ≈ 45 Ko | Modules de test Nest | — | 0.3 |
| `supertest` | ^7.3.1 | MIT | ≈ 47 Ko | Tests HTTP d'intégration (TD-006) | fetch sur un port réel : plus lent, ports à gérer | 0.3 |
| `@types/supertest` | ^7.2.1 | MIT | ≈ 10 Ko | Types de supertest | — | 0.3 |
| `@types/pg` | ^8.23.1 | MIT | ≈ 19 Ko | Types de pg | — | 0.3 |
| `@types/express` | ^5.0.6 | MIT | ≈ 7 Ko | Types d'Express | — | 0.3 |
| `testcontainers` | ^12.2.1 | MIT | ≈ 250 Ko | Conteneurs jetables pour les tests d'intégration (TD-006) | Base de développement partagée : tests non isolés | 0.3 |
| `@testcontainers/postgresql` | ^12.2.1 | MIT | ≈ 16 Ko | Module PostgreSQL de testcontainers | Conteneur générique configuré à la main | 0.3 |
| `@testcontainers/redis` | ^12.2.1 | MIT | ≈ 9 Ko | Module Redis de testcontainers | Conteneur générique configuré à la main | 0.3 |
| `unplugin-swc` | ^2.0.0 | MIT | ≈ 44 Ko | Transformation SWC dans Vitest (métadonnées de décorateurs) | esbuild de Vitest : n'émet pas les métadonnées, l'injection Nest échoue | 0.3 |
| `@swc/core` | ^1.16.20 | Apache-2.0 | ≈ 130 Ko (+ binaire natif) | Compilateur utilisé par unplugin-swc | tsc dans les tests : beaucoup plus lent | 0.3 |

## Web et contrats (apps/web, packages/contracts) — lot 0.5

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `react` | ^19.3.1 | MIT | ≈ 170 Ko | Composants d'interface (TD-003) ; version exigée par Next.js 16 (lot 0.4) | Aucune : imposé par Next.js | 0.5 |
| `react-dom` | ^19.3.1 | MIT | ≈ 7,7 Mo | Rendu DOM de React | Aucune : imposé par Next.js | 0.5 |
| `react-hook-form` | ^7.91.0 | MIT | ≈ 1,6 Mo | Formulaires performants, longs formulaires d'inscription (TD-003) | État contrôlé React : re-rendu à chaque frappe, lent sur appareils modestes | 0.5 |
| `@hookform/resolvers` | ^6.0.0 | MIT | ≈ 1,1 Mo | Branche les schémas Zod de packages/contracts sur les formulaires (C1) | Validation manuelle : double écriture des règles, divergence garantie | 0.5 |
| `@testing-library/react` | ^16.3.3 | MIT | ≈ 300 Ko | Tests de composants par le comportement | Enzyme : abandonné | 0.5 |
| `@testing-library/user-event` | ^14.6.8 | MIT | ≈ 430 Ko | Saisies utilisateur réalistes en test | fireEvent seul : n'imite pas la frappe réelle | 0.5 |
| `@testing-library/dom` | ^10.4.2 | MIT | ≈ 2,4 Mo | Requêtes DOM (dépendance de pair de @testing-library/react) | — | 0.5 |
| `jsdom` | ^30.1.3 | MIT | ≈ 5,3 Mo | DOM simulé pour les tests de composants | happy-dom : moins fidèle ; navigateur réel (Playwright) réservé aux tests E2E | 0.5 |
| `@types/react` | ^19.3.0 | MIT | ≈ 400 Ko | Types de React | — | 0.5 |
| `@types/react-dom` | ^19.3.0 | MIT | ≈ 32 Ko | Types de react-dom | — | 0.5 |

## Applications Next.js et design system (apps/web, apps/admin, packages/ui) — lot 0.4

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `next` | ^16.4.3 | MIT | ≈ 192 Mo (dont binaire SWC ; serveur autonome livré bien plus léger) | Framework web App Router, rendu serveur, proxy CSP (TD-003) ; 16 plutôt que 15 (plancher du plan, D1 du lot 0.4) | Remix / SPA Vite : écartés en TD-003 (3G, SEO) | 0.4 |
| `next-intl` | ^4.14.9 | MIT | ≈ 410 Ko | i18n : routage `/` français, `/en` anglais, messages ICU (EX-T21.3, D2) | Dictionnaires maison : pluriels et formats ICU à réécrire | 0.4 |
| `tailwindcss` | ^4.3.3 | MIT | ≈ 770 Ko | Styles utilitaires branchés sur les jetons OZ (TD-008) | CSS modules : jetons à recâbler composant par composant | 0.4 |
| `@tailwindcss/postcss` | ^4.3.3 | MIT | ≈ 100 Ko | Intégration de Tailwind 4 au pipeline CSS de Next | Aucune : intégration officielle | 0.4 |
| `@fontsource-variable/inter` | ^5.3.0 | OFL-1.1 | ≈ 1,9 Mo (seuls latin et latin-ext servis, ≈ 133 Ko) | Police du corps de texte, auto-hébergée (design.md §8.5, D3) | Google Fonts : appel à un tiers, refusé (R12, connexion faible) | 0.4 |
| `@fontsource-variable/inter-tight` | ^5.3.0 | OFL-1.1 | ≈ 480 Ko (latin et latin-ext servis) | Police des titres (design.md §8.5) | Inter seule : perd la signature typographique des maquettes | 0.4 |
| `@fontsource-variable/jetbrains-mono` | ^5.3.0 | OFL-1.1 | ≈ 200 Ko (latin et latin-ext servis) | Chasse fixe des OZ ID et codes (design.md §8.5) | Police monospace système : rendu variable selon l'appareil | 0.4 |
| `@next/eslint-plugin-next` | ^16.4.3 | MIT | ≈ 105 Ko | Règles ESLint de Next et Core Web Vitals (EX-T22) | eslint-config-next : embarque des règles redondantes avec typescript-eslint | 0.4 |
| `@playwright/test` | ^1.64.1 | Apache-2.0 | ≈ 30 Ko (+ playwright-core ≈ 13,7 Mo, navigateurs hors dépôt) | Fumée navigateur sur le build autonome (D4) ; parcours E2E ensuite (TD-006) | Cypress : écarté en TD-006 | 0.4 |
| `@axe-core/playwright` | ^4.14.0 | MPL-2.0 | ≈ 48 Ko (+ axe-core ≈ 3,4 Mo) | Contrôle WCAG 2.1 AA automatisé (EX-T22.1) | Audit manuel seul : pas de garde-fou continu | 0.4 |

## Base de données et données de test (packages/db, packages/testing) — lot 0.6

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `prisma` | 7.9.1 | Apache-2.0 | ≈ 600 Ko (+ moteur de migration ≈ 40 Mo, téléchargé par `@prisma/engines`) | CLI : génération du client, migrations versionnées (TD-002). 7.9.1 : dernière CLI publiée avec attestation de provenance (7.10.x publiées sans, prisma/orm#30850 ; `trustPolicy` les refuse, DEBT D-028) | dbmate / node-pg-migrate : `down` natif, mais s'écarte du plan (Prisma) | 0.6 |
| `@prisma/client` | 7.9.1 | Apache-2.0 | ≈ 74 Mo (client généré dans `src/generated`, non versionné) | Client typé de la base (TD-002) | SQL paramétré seul (`pg`) : pas de typage généré | 0.6 |
| `@prisma/adapter-pg` | 7.9.1 | Apache-2.0 | ≈ 72 Ko | Branche Prisma 7 sur le pilote `pg` déjà utilisé par l'API | Aucune : adaptateur requis par Prisma 7 | 0.6 |
| `@faker-js/faker` | 10.6.0 (épinglé : les données synthétiques en dépendent) | MIT | ≈ 2,9 Mo | Données synthétiques déterministes (graine fixe) pour les fabriques, seeds et l'anonymisation (R10, D4) | Générateur maison : listes de noms à maintenir | 0.6 |

## Design system et Storybook (packages/ui) — lot 0.10

Composants adaptés de shadcn/ui (code possédé, pas de paquet shadcn) sur les primitives Radix (décision D4). Storybook 10 (TD-020) : télémétrie coupée par `core.disableTelemetry` et `STORYBOOK_DISABLE_TELEMETRY=1` (scripts et CI). Exception de chaîne d'approvisionnement : `semver@6.3.1`, tiré par Babel via Storybook, exclu nominativement de `trustPolicy` (DEBT D-052).

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `@radix-ui/react-dialog` | ^1.3.1 | MIT | ≈ 128 Ko | Modale accessible : piège du focus, Échap, `aria-modal` | `<dialog>` natif : retour du focus et blocage du défilement inégaux selon les navigateurs | 0.10 |
| `@radix-ui/react-label` | ^2.1.17 | MIT | ≈ 36 Ko | Libellé de champ (évite la sélection au double clic) | `<label>` natif : retenu en repli, différence mineure | 0.10 |
| `@radix-ui/react-select` | ^2.4.1 | MIT | ≈ 388 Ko | Sélecteur stylable, clavier complet, lecteurs d'écran | `<select>` natif : liste non stylable sur le thème sombre | 0.10 |
| `@radix-ui/react-slot` | ^1.2.3 | MIT | ≈ 56 Ko | `asChild` : style du bouton sur un lien | Prop `href` dupliquant le composant : deux implémentations à maintenir | 0.10 |
| `@radix-ui/react-toast` | ^1.3.1 | MIT | ≈ 208 Ko | Notifications annoncées (`aria-live`), fermeture, balayage | Région `aria-live` maison : file, durée et pause au survol à réécrire | 0.10 |
| `class-variance-authority` | ^0.7.1 | Apache-2.0 | ≈ 44 Ko | Variantes typées des composants | Objets de classes manuels : pas de typage des variantes | 0.10 |
| `clsx` | ^2.1.1 | MIT | ≈ 40 Ko | Classes conditionnelles | Gabarits de chaînes : illisibles au-delà de deux conditions | 0.10 |
| `tailwind-merge` | ^3.7.0 | MIT | ≈ 1,1 Mo (≈ 8 Ko compressé servi) | Résout les conflits de classes Tailwind passées en `className` | Interdire `className` : composants non adaptables | 0.10 |
| `storybook` | 10.6.3 (exact) | MIT | ≈ 22 Mo | Vitrine et banc d'essai du design system (EX-010, TD-020) | Ladle : pas d'addon a11y ni d'exécution des stories en test | 0.10 |
| `@storybook/react-vite` | 10.6.3 (exact) | MIT | ≈ 140 Ko | Cadre React + Vite de Storybook | — | 0.10 |
| `@storybook/addon-a11y` | 10.6.3 (exact) | MIT | ≈ 240 Ko | Contrôle axe-core de chaque story, bloquant en test | `@axe-core/playwright` sur des pages : ne couvre pas chaque état isolé | 0.10 |
| `@storybook/addon-docs` | 10.6.3 (exact) | MIT | ≈ 1,3 Mo | Documentation générée (props, variantes) et pages MDX | README seul : pas de rendu vivant | 0.10 |
| `@storybook/addon-vitest` | 10.6.3 (exact) | MIT | ≈ 572 Ko | Exécute les stories comme tests Vitest (`test:stories`) | test-runner Storybook : serveur à lancer, plus lent | 0.10 |
| `vite` | ^8.3.5 | MIT | ≈ 2,4 Mo | Bundler de Storybook et des tests navigateur | Webpack : plus lent, configuration plus lourde | 0.10 |
| `@vitejs/plugin-react` | ^6.1.2 | MIT | ≈ 72 Ko | JSX et rafraîchissement pour Vite (projet de tests `motion`) | — | 0.10 |
| `@tailwindcss/vite` | ^4.3.3 | MIT | ≈ 36 Ko | Tailwind 4 dans Vite (Storybook, tests navigateur) | PostCSS : déjà utilisé par Next, plus lent sous Vite | 0.10 |
| `@vitest/browser-playwright` | ^5.0.5 | MIT | ≈ 88 Ko | Tests Vitest dans Chromium sans affichage | jsdom : ni CSS calculé, ni axe-core fiable, ni `prefers-reduced-motion` | 0.10 |
| `playwright` | ^1.64.1 | Apache-2.0 | ≈ 4,9 Mo (navigateur installé à part) | Pilote Chromium pour `@vitest/browser-playwright` ; même version que `@playwright/test` (racine) | — | 0.10 |

## OZ ID (packages/core) — lot 1.2

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `qrcode-generator` | ^2.0.4 | MIT | ≈ 630 Ko, sans dépendance | Matrice du QR du profil (EX-102 n° 7) ; le SVG est écrit par `packages/core` | Encodeur QR maison (Reed-Solomon, masques) : long et risqué | 1.2 |
| `fast-check` | ^4.10.2 (dev) | MIT | ≈ 1,5 Mo (+ `pure-rand` ≈ 240 Ko) | Tests de propriétés CP-01 et CP-04 (`design.md` §2) | Boucles aléatoires maison : ni réduction des contre-exemples ni graine rejouable | 1.2 |
| `jsqr` | ^1.4.0 (dev) | Apache-2.0 | ≈ 330 Ko, sans dépendance | Décodage du QR dans les tests (preuve que le SVG se lit) | Aucune : pas de décodeur QR natif dans Node | 1.2 |

## Authentification (packages/auth, apps/api) — lot 1.3a

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `@node-rs/argon2` | ^2.2.2 | MIT | ≈ 60 Ko (+ binaire précompilé par plateforme ≈ 600 Ko, paquet optionnel, aucun script d'installation) | Hachage Argon2id des mots de passe, m=19456, t=2, p=1 (EX-103 n° 2, TD-005) | `crypto.argon2` de Node : expérimental (Node ≥ 24.7), sans format PHC ni vérification, absent du Node 22 de certains postes ; `argon2` (node-gyp) : script d'installation, refusé par `allowBuilds` | 1.3a |
| `nodemailer` | ^10.2.1 | MIT-0 | ≈ 2 Mo, sans dépendance, types inclus | Envoi SMTP des emails d'authentification : Mailpit en local, Scaleway TEM en recette et en production (D2 du lot 1.3a, TD-011) | Client SMTP maison sur `node:net`/`node:tls` : STARTTLS, authentification et encodage MIME à réécrire ; SDK HTTP de TEM : lie le code au fournisseur avant l'interface `EmailProvider` du lot 1.15 | 1.3a |
| `jose` | ^6.2.12 | MIT | ≈ 210 Ko, sans dépendance, types inclus, provenance SLSA | Signature et vérification HS256 du jeton d'accès de 15 minutes, algorithme imposé (EX-103 n° 3, TD-005, lot 1.3b) | JWT écrit à la main sur `node:crypto` : comparaison à temps constant, encodage, validation des claims et des en-têtes (`alg`, `crit`, `typ`) à réimplémenter et à auditer ; `jsonwebtoken` : dépendances multiples, CommonJS | 1.3b |
| `@casl/ability` | 7.0.2 (exact) | MIT | ≈ 280 Ko (+ 4 sous-paquets `@ucast/*`) | Politiques d'autorisation de la matrice EX-104 (plan §4, D8 du lot 1.4a). 7.0.2 retenue : 7.0.3 à 7.1.1 ont moins de 14 jours au 2026-11-02 | Règles écrites à la main : écart au plan | 1.4a |
| `otplib` | ^13.6.0 | MIT | ≈ 600 Ko (+ 6 sous-paquets `@otplib/*`, `@noble/hashes` et `@scure/base`, audités, ≈ 1,7 Mo) | TOTP RFC 6238 de la 2FA (TD-005, plan §4, D1 du lot 1.3cb), anti-rejeu par pas de temps | RFC 6238 écrite à la main sur `node:crypto` : écart au plan, code cryptographique à maintenir | 1.3cb |

## Coffre documentaire (packages/storage, apps/api, apps/worker) — lot 1.9a

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `@aws-sdk/s3-request-presigner` | 3.1156.0 (exact) | Apache-2.0 | ≈ 80 Ko (mêmes sous-paquets que `@aws-sdk/client-s3`, déjà présent depuis le lot 0.3 ; même version que lui, une seule copie du SDK, quoique publiée depuis moins de 14 jours) | URL de dépôt PUT signée 5 min, type, taille et SHA-256 signés (EX-110 n° 1, D1 du lot 1.9a) | Présignature SigV4 maison : signature, encodage et expiration à réimplémenter et à auditer | 1.9a |
| `file-type` | 22.2.0 (exact ; 22.3.0 publiée depuis moins de 14 jours) | MIT | ≈ 140 Ko | Type réel d'un fichier déposé, lu sur ses octets de tête, jamais sur l'extension ni l'en-tête déclaré (D3 du lot 1.9a) | Lecture maison des signatures : à tenir à jour pour chaque format, PDF et WebP compris | 1.9a |
| `bullmq` | 6.3.17 (exact ; versions suivantes publiées depuis moins de 14 jours) | MIT | ≈ 3 Mo | File `document-scan` entre l'API et le worker (TD-002, D2 du lot 1.9a), sur le Redis existant | Liste Redis maison : ni reprise, ni nouvel essai, ni verrou de traitement | 1.9a |

## Correctifs forcés (overrides pnpm) — lot 0.3

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `multer` | ^2.5.0 (override) | MIT | ≈ 53 Ko | Correctif GHSA-q7qp-rjg7-q26m (déni de service) sur la dépendance transitive de @nestjs/platform-express | Attendre une nouvelle version de Nest : vulnérabilité haute ouverte entre-temps | 0.3 |
| `mysql2` | ^3.24.4 (override, résolu 3.24.6, attesté) | MIT | ≈ 630 Ko | Correctif GHSA-3f6p-5ww8-9rcr (haute) sur la dépendance de `prisma@7.9.1` (DEBT D-028) ; version qu'embarque Prisma 7.10.x | Prisma 7.10.x : CLI sans attestation de provenance | 0.7 |
| `deepmerge-ts` | ^8.0.2 (override, attesté) | BSD-3-Clause | ≈ 265 Ko | Correctif GHSA-ggr8-5vv4-36mx (haute) sur la dépendance de `@prisma/config@7.9.1` ; version qu'embarque Prisma 7.10.x | idem | 0.7 |

**Scripts d'installation :** aucun n'est exécuté. Refus explicites dans `pnpm-workspace.yaml` (`allowBuilds`) : `@scarf/scarf` (télémétrie de swagger-ui-dist), `@swc/core`, `cpu-features`, `protobufjs`, `ssh2`, `msgpackr-extract` (accélérateur natif optionnel de msgpackr, tiré par bullmq : repli JavaScript), `@parcel/watcher` (tiré par next-intl, binaire précompilé fourni par un paquet optionnel), `prisma` (simple contrôle de version de Node). **Seule exception autorisée : `@prisma/engines`** (`true`), qui télécharge le moteur de migration publié par Prisma depuis `binaries.prisma.sh`, empreinte vérifiée par Prisma (D5 du lot 0.6).

## Images Docker (développement local) — lot 0.2

Environnement local uniquement (`infra/docker/compose.dev.yml`) ; aucune donnée réelle (R10). Versions épinglées, mises à jour par Dependabot (écosystème `docker-compose`) ; montées majeures de `postgres` et `redis` ignorées jusqu’au lot 0.8 (D-005).

| Image | Version | Licence | Rôle | Alternative envisagée | Ajouté |
|---|---|---|---|---|---|
| `postgres` | 16.15-alpine (majeure à confirmer avec Scaleway, TD-009) | PostgreSQL License | Base de données (TD-002) | — | 0.2 |
| `redis` | 7.4.11-alpine | RSALv2 / SSPLv1 (depuis 7.4) | Cache, sessions, files BullMQ | Valkey (BSD-3) : à évaluer pour la recette et la production au lot 0.8 | 0.2 |
| `chrislusf/seaweedfs` | 4.50 | Apache-2.0 | Stockage compatible S3 (TD-010) | MinIO, prévu au plan : image officielle retirée en octobre 2025, dépôt archivé ; Garage (AGPL-3.0) : pas de versioning | 0.2 |
| `clamav/clamav` | 1.5.4-debian13-slim | GPL-2.0 | Antivirus des fichiers téléversés | Variante Alpine : pas d'arm64 | 0.2 |
| `axllent/mailpit` | v1.32.0 | MIT | Capture des emails en local | MailHog : non maintenu | 0.2 |

## Images de base des applications — lot 0.8a

Épinglées par condensé dans `infra/docker/images/*.Dockerfile`, mises à jour par Dependabot (écosystème `docker`, délai de 14 jours).

| Image | Version | Licence | Rôle | Alternative envisagée |
|---|---|---|---|---|
| `node:24-trixie-slim` | `sha256:43b9ba11…` | MIT (Node.js) / Debian | Étape de construction : pnpm (corepack), `turbo prune`, build | `node:24-alpine` : musl, écarts possibles avec la production |
| `gcr.io/distroless/nodejs24-debian13:nonroot` | `sha256:cb606325…` | Apache-2.0 | Exécution : ni shell ni gestionnaire de paquets, utilisateur 65532 | `node:24-trixie-slim` en exécution : shell et surface d'attaque plus larges |

## Intégration continue (hors npm) — lot 0.7

| Outil | Version | Licence | Rôle | Épinglage |
|---|---|---|---|---|
| `actions/checkout` | v7.0.1 | MIT | Récupération du dépôt (identifiants non conservés) | Commit `3d3c42e5…` |
| `actions/setup-node` | v7.1.0 | MIT | Node 24 depuis `.nvmrc`, cache pnpm | Commit `949feb24…` |
| `pnpm/action-setup` | v6.1.0 | MIT | pnpm de `packageManager` | Commit `ea17c68d…` (étiquette annotée : commit, pas étiquette) |
| `actions/cache` | v6.1.0 | MIT | Cache Turbo | Commit `55cc8345…` |
| `actions/upload-artifact` | v7.0.2 | MIT | Rapports de couverture et Playwright | Commit `cf430e03…` |
| gitleaks | 8.30.1 | MIT | Secrets dans tout l'historique (R8) | SHA-256 dans `scripts/install-ci-tools.sh` |
| Trivy | 0.75.0 | Apache-2.0 | Vulnérabilités, configurations, secrets | SHA-256 dans `scripts/install-ci-tools.sh` |
| Semgrep CE | 1.180.0 | LGPL-2.1 (règles du registre : licences propres) | Analyse statique (D1) | Image `semgrep/semgrep@sha256:529ee8a2…` |

## Infrastructure en code — lot 0.8b

Versions exactes dans `infra/terraform/**/versions.tf` ; empreintes dans les `.terraform.lock.hcl` versionnés (darwin_arm64, linux_amd64).

| Outil | Version | Licence | Rôle | Alternative envisagée |
|---|---|---|---|---|
| Terraform | 1.16.5 | BUSL-1.1 (usage interne autorisé) | Infrastructure Scaleway en code (TD-019) ; CI : SHA-256 dans `scripts/install-ci-tools.sh` | OpenTofu (MPL-2.0) |
| `scaleway/scaleway` | 2.86.0 | MPL-2.0 | Fournisseur Scaleway | — |
| `hashicorp/random` | 3.9.1 | MPL-2.0 | Valeurs éphémères (mots de passe, secrets JWT), suffixes de noms | — |

## Outils système (hors npm)

| Outil | Rôle | Installation |
|---|---|---|
| Docker Desktop | Moteur de conteneurs du poste (TD-004) | Installé par le développeur ; gratuit pour une petite structure |
| gitleaks | Détection de secrets en pre-commit et en CI (R8) | Poste : 8.30.1 (release officielle GitHub, SHA-256 vérifié, `~/.local/bin`), minimum 8.19.0 imposé par le hook ; CI : lot 0.7 |
| corepack | Fournit pnpm à la version figée dans `package.json` | Livré avec Node.js |
