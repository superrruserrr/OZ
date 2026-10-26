# Registre des dépendances (R12)

Toute dépendance externe (racine, apps, paquets) figure ici **avant** d'être mergée : licence vérifiée, audit de vulnérabilités, poids évalué, alternative native envisagée. `pnpm lint` échoue si une dépendance déclarée n'y figure pas (`scripts/check-dependencies.mjs`).

Audit : `pnpm audit --audit-level high` — aucune vulnérabilité connue au 2026-10-24.

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
| `@aws-sdk/client-s3` | ^3.1156.0 | Apache-2.0 | ≈ 3,2 Mo | Sonde de santé du stockage ; URL signées au lot 1.9 | Signature SigV4 maison : risque de sécurité | 0.3 |
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

## Correctifs forcés (overrides pnpm) — lot 0.3

| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |
|---|---|---|---|---|---|---|
| `multer` | ^2.5.0 (override) | MIT | ≈ 53 Ko | Correctif GHSA-q7qp-rjg7-q26m (déni de service) sur la dépendance transitive de @nestjs/platform-express | Attendre une nouvelle version de Nest : vulnérabilité haute ouverte entre-temps | 0.3 |

**Scripts d'installation :** aucun n'est exécuté. Refus explicites dans `pnpm-workspace.yaml` (`allowBuilds`) : `@scarf/scarf` (télémétrie de swagger-ui-dist), `@swc/core`, `cpu-features`, `protobufjs`, `ssh2`, `@parcel/watcher` (tiré par next-intl, binaire précompilé fourni par un paquet optionnel).

## Images Docker (développement local) — lot 0.2

Environnement local uniquement (`infra/docker/compose.dev.yml`) ; aucune donnée réelle (R10). Versions épinglées, mises à jour par Dependabot (écosystème `docker-compose`) ; montées majeures de `postgres` et `redis` ignorées jusqu’au lot 0.8 (D-005).

| Image | Version | Licence | Rôle | Alternative envisagée | Ajouté |
|---|---|---|---|---|---|
| `postgres` | 16.15-alpine (majeure à confirmer avec Scaleway, TD-009) | PostgreSQL License | Base de données (TD-002) | — | 0.2 |
| `redis` | 7.4.11-alpine | RSALv2 / SSPLv1 (depuis 7.4) | Cache, sessions, files BullMQ | Valkey (BSD-3) : à évaluer pour la recette et la production au lot 0.8 | 0.2 |
| `chrislusf/seaweedfs` | 4.50 | Apache-2.0 | Stockage compatible S3 (TD-010) | MinIO, prévu au plan : image officielle retirée en octobre 2025, dépôt archivé ; Garage (AGPL-3.0) : pas de versioning | 0.2 |
| `clamav/clamav` | 1.5.4-debian13-slim | GPL-2.0 | Antivirus des fichiers téléversés | Variante Alpine : pas d'arm64 | 0.2 |
| `axllent/mailpit` | v1.32.0 | MIT | Capture des emails en local | MailHog : non maintenu | 0.2 |

## Outils système (hors npm)

| Outil | Rôle | Installation |
|---|---|---|
| Docker Desktop | Moteur de conteneurs du poste (TD-004) | Installé par le développeur ; gratuit pour une petite structure |
| gitleaks | Détection de secrets en pre-commit et en CI (R8) | Poste : 8.30.1 (release officielle GitHub, SHA-256 vérifié, `~/.local/bin`), minimum 8.19.0 imposé par le hook ; CI : lot 0.7 |
| corepack | Fournit pnpm à la version figée dans `package.json` | Livré avec Node.js |
