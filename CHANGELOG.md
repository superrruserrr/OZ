# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouté

- Lot 0.3 — squelette d'API NestJS 12 : configuration typée Zod (démarrage refusé si invalide, valeurs jamais affichées), format d'erreur normalisé, `X-Request-Id` et logs JSON pino masqués, `/health` (PostgreSQL, Redis, S3) et `/docs` hors production, en-têtes de sécurité §6.5, CORS en liste blanche.

### Sécurité

- Override `multer` ^2.5.0 (GHSA-q7qp-rjg7-q26m) ; aucun script d'installation de dépendance exécuté (`allowBuilds`).

### Ajouté (suite)

- Lot 0.2 — environnement de développement Docker Compose (PostgreSQL, Redis, SeaweedFS en remplacement de MinIO, ClamAV, Mailpit) sur 127.0.0.1, `.env.example` complet et testé, scripts `pnpm dev:up|down|reset|status`, registre des images.
- Lot 0.1 — monorepo pnpm + Turborepo (4 apps, 7 paquets), TypeScript strict, ESLint (refus de `any` et des commentaires de dette), Prettier, hooks Git (gitleaks, lint-staged, commitlint), Vitest, registres `DEPENDENCIES.md` et `DEBT.md`, configuration Dependabot.
