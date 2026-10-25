# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouté

- Lot 0.2 — environnement de développement Docker Compose (PostgreSQL, Redis, SeaweedFS en remplacement de MinIO, ClamAV, Mailpit) sur 127.0.0.1, `.env.example` complet et testé, scripts `pnpm dev:up|down|reset|status`, registre des images.
- Lot 0.1 — monorepo pnpm + Turborepo (4 apps, 7 paquets), TypeScript strict, ESLint (refus de `any` et des commentaires de dette), Prettier, hooks Git (gitleaks, lint-staged, commitlint), Vitest, registres `DEPENDENCIES.md` et `DEBT.md`, configuration Dependabot.
