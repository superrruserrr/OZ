# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouté

- Lot 0.6 — base de données initiale : Prisma 7.10.1 (client sur `pg`), migration initiale réversible (extensions `pgcrypto`, `pg_trgm`, `unaccent`, UUIDv7 `oz_uuid_v7()`, table `system_settings`), convention `down.sql` vérifiée et `pnpm db:rollback` atomique, cycle `up` → `down` → `up` testé sur PostgreSQL jetable, fabriques synthétiques déterministes `@oz/testing`, `pnpm db:seed`, anonymisation par registre de colonnes testée (EX-T10).
- Lot 0.4 — squelette web Next.js 16 : `apps/web` (accueil provisoire sombre aux jetons OZ, `/` en français et `/en` en anglais via next-intl, chaîne en dur refusée par ESLint), `apps/admin` (non indexable), jetons de `design.md` §8.3 dans `@oz/ui` avec contrastes WCAG testés, polices Inter / Inter Tight / JetBrains Mono auto-hébergées (latin et latin-ext seulement), CSP avec nonce par requête et en-têtes §6.5 partagés (`@oz/config/security-headers`), serveurs autonomes prêts pour la recette, fumée Playwright + axe (`pnpm test:e2e`).
- Lot 0.5 — contrats partagés `@oz/contracts` (conventions vérifiées automatiquement, briques `email`, `personName`, `longText`, `consent`), `ZodValidationPipe` et `@ValidatedBody` (422 avant toute logique, champ inconnu refusé), premier contrat : formulaire de contact (composant React + `POST /contact` derrière le drapeau `FEATURE_CONTACT_FORM`, interdit en production), test de contrat formulaire ↔ schéma obligatoire.
- Lot 0.3 — squelette d'API NestJS 12 : configuration typée Zod (démarrage refusé si invalide, valeurs jamais affichées), format d'erreur normalisé, `X-Request-Id` et logs JSON pino masqués, `/health` (PostgreSQL, Redis, S3) et `/docs` hors production, en-têtes de sécurité §6.5, CORS en liste blanche.

### Sécurité

- Dependabot n'ouvre plus de PR pour les montées majeures de `typescript`, `@types/node`, `postgres` et `redis` ; PostgreSQL 16.15 et Redis 7.4.11 rétablis (#10).
- Override `multer` ^2.5.0 (GHSA-q7qp-rjg7-q26m) ; aucun script d'installation de dépendance exécuté (`allowBuilds`).

### Ajouté (suite)

- Lot 0.2 — environnement de développement Docker Compose (PostgreSQL, Redis, SeaweedFS en remplacement de MinIO, ClamAV, Mailpit) sur 127.0.0.1, `.env.example` complet et testé, scripts `pnpm dev:up|down|reset|status`, registre des images.
- Lot 0.1 — monorepo pnpm + Turborepo (4 apps, 7 paquets), TypeScript strict, ESLint (refus de `any` et des commentaires de dette), Prettier, hooks Git (gitleaks, lint-staged, commitlint), Vitest, registres `DEPENDENCIES.md` et `DEBT.md`, configuration Dependabot.
