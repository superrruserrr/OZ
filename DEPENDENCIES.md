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

## Outils système (hors npm)

| Outil | Rôle | Installation |
|---|---|---|
| gitleaks | Détection de secrets en pre-commit et en CI (R8) | Poste : 8.30.1 (release officielle GitHub, SHA-256 vérifié, `~/.local/bin`), minimum 8.19.0 imposé par le hook ; CI : lot 0.7 |
| corepack | Fournit pnpm à la version figée dans `package.json` | Livré avec Node.js |
