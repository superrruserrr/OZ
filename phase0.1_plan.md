# Phase 0.1: Monorepo et outillage qualité

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | Initialiser le dépôt Git et l'hygiène de base | EX-001, EX-T02, EX-T08 |
| 2 | pnpm workspaces + Turborepo + arborescence §3.3 | EX-001 |
| 3 | TypeScript strict, ESLint, Prettier | EX-001, EX-T05 |
| 4 | Husky + lint-staged + commitlint + gitleaks | EX-001, EX-T02, EX-T08 |
| 5 | Vitest à la racine, un test par paquet | EX-001, EX-T06 |
| 6 | Registres de gouvernance + Dependabot | EX-T05, EX-T12, TD Maintenance |

## Dependencies

- [x] J0 atteint (confirmé par Gaëtan Wassu le 2026-10-24)
- [x] Node.js ≥ 22 sur le poste (v22.23.4 installée ; cible TD-001 : Node 24 LTS → consigné dans `DEBT.md`)
- [x] corepack disponible (fournit pnpm)
- [ ] **gitleaks installé sur le poste** — requis par le hook pre-commit (R8, bloquant) ; à installer par Gaëtan Wassu avant le premier commit (`/commit-phase 0.1`)
- [ ] Dépôt GitHub distant + protection de `main` et `develop` — action de Gaëtan Wassu (création du dépôt privé) ; hors périmètre de `/execute-phase`, requis avant `/commit-phase 0.1`

---

## Tasks

### Task 1: Dépôt Git et hygiène

**What:** Initialiser Git à la racine du projet (branche par défaut `main`) avec les fichiers d'hygiène, sans commit (le commit relève de `/commit-phase`).

**Files:**
- Create: `.gitignore` — `node_modules`, `dist`, `.turbo`, `coverage`, `.env*` sauf `.env.example`, `.DS_Store`, **`OZ_Document_de_Projet.pdf` et `EX CHART/`** (documents confidentiels sous NDA, conservés hors dépôt)
- Create: `.gitattributes` — `* text=auto eol=lf`, binaires marqués
- Create: `.editorconfig`
- Create: `.nvmrc` — `24`
- Create: `package.json` (racine) — `private`, `packageManager: pnpm@<version>`, `engines.node >=22`, scripts `build`, `lint`, `typecheck`, `test`, `format`, `format:check`
- Create: `README.md` — démarrage en 4 commandes, liens vers les documents de référence

**AC:**
- [ ] `git status` fonctionne à la racine ; branche courante `main`, aucun commit créé
- [ ] `git check-ignore OZ_Document_de_Projet.pdf "EX CHART/x.jpg" .env` renvoie les trois chemins (EX-T08)
- [ ] `.env.example` n'est pas ignoré

---

### Task 2: Workspaces pnpm, Turborepo, arborescence

**What:** Créer l'arborescence §3.3 avec un paquet minimal compilable dans chaque app et package, orchestrée par Turborepo.

**Files:**
- Create: `pnpm-workspace.yaml` — `apps/*`, `packages/*`
- Create: `turbo.json` — tâches `build` (dépend de `^build`, sorties `dist/**`), `lint`, `typecheck`, `test` (dépend de `^build`)
- Create: `apps/{web,admin,api,worker}/package.json`, `tsconfig.json`, `src/index.ts` — squelettes neutres (Next.js et NestJS arrivent en 0.3 / 0.4)
- Create: `packages/{contracts,db,ui,core,auth,config,testing}/package.json`, `tsconfig.json`, `src/index.ts` — nom `@oz/<nom>`, `type: module`, exports vers `dist`
- Create: `infra/{docker,terraform,scripts}/README.md`, `docs/{adr,runbooks,api,security}/README.md`

**AC:**
- [ ] `pnpm install` réussit sans avertissement de dépendance fantôme
- [ ] `pnpm build` compile les 11 paquets via Turborepo
- [ ] Les noms de paquets suivent `@oz/<nom>` ; fichiers en kebab-case (`naming_conventions.md`)

---

### Task 3: TypeScript strict, ESLint, Prettier

**What:** Configuration TypeScript stricte partagée, lint bloquant sur `any` et sur `TODO`/`FIXME` (R5), formatage Prettier.

**Files:**
- Create: `tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `module`/`moduleResolution` `NodeNext`, `target` ES2023
- Modify: chaque `tsconfig.json` de paquet — `extends` la base
- Create: `eslint.config.mjs` — flat config, `typescript-eslint` (strict, type-checked), `@typescript-eslint/no-explicit-any: error`, `no-warning-comments` (`todo`, `fixme`) en `error`, `no-console: error`
- Create: `.prettierrc.json`, `.prettierignore`

**AC:**
- [ ] `pnpm typecheck` et `pnpm lint` passent sur l'arborescence propre
- [ ] Un fichier contenant `const x: any = 1` fait échouer `pnpm lint` (EX-T05)
- [ ] Un fichier contenant `// TODO` fait échouer `pnpm lint` (EX-T05)
- [ ] `pnpm format:check` passe

---

### Task 4: Hooks Git — Husky, lint-staged, commitlint, gitleaks

**What:** Bloquer en local les commits non conformes : format, lint des fichiers modifiés, message Conventional Commits, secrets.

**Files:**
- Create: `.husky/pre-commit` — `gitleaks git --staged` (échec explicite avec instruction d'installation si gitleaks est absent), puis `lint-staged`
- Create: `.husky/commit-msg` — `commitlint --edit`
- Create: `commitlint.config.mjs` — `@commitlint/config-conventional`, scopes autorisés = modules et paquets OZ
- Create: `.gitleaks.toml` — règles par défaut + règle `JWT_*_SECRET` ; liste blanche `.env.example`
- Modify: `package.json` — script `prepare: husky`, config `lint-staged` (eslint --fix, prettier --write)

**AC:**
- [ ] `echo "update stuff" | pnpm commitlint` échoue ; `echo "feat(core): ajout du squelette" | pnpm commitlint` réussit (EX-T02)
- [ ] Le hook pre-commit refuse un fichier indexé contenant un faux secret de test (exécuté quand gitleaks est installé) (EX-T08)
- [ ] Sans gitleaks, le hook échoue avec un message qui indique comment l'installer (jamais d'échec silencieux ni de contournement)

---

### Task 5: Vitest

**What:** Exécuter les tests de tous les paquets depuis la racine, couverture v8 prête pour les seuils de 0.7.

**Files:**
- Create: `vitest.config.ts` (racine) — `test.projects` sur `apps/*` et `packages/*`, couverture `v8`
- Create: `apps/*/src/index.test.ts`, `packages/*/src/index.test.ts` — un test réel du module exporté
- Modify: `package.json` de chaque paquet — script `test: vitest run`

**AC:**
- [ ] `pnpm test` exécute 11 suites, toutes vertes
- [ ] `pnpm vitest run --coverage` produit un rapport (seuils R6 activés en 0.7) (EX-T06)

---

### Task 6: Registres de gouvernance et Dependabot

**What:** Créer les registres imposés par R5 et R12, le CHANGELOG, et la configuration Dependabot sans auto-merge.

**Files:**
- Create: `DEPENDENCIES.md` — une ligne par dépendance ajoutée en 0.1 : licence, audit (`pnpm audit`), poids, alternative native envisagée (R12)
- Create: `DEBT.md` — gabarit + entrée « poste local en Node 22, cible Node 24 LTS » avec échéance et responsable
- Create: `CHANGELOG.md` — format Keep a Changelog, section `Unreleased`
- Create: `.github/dependabot.yml` — `monthly`, groupes par écosystème (`npm`, `github-actions`, `docker`), `open-pull-requests-limit: 5`, `target-branch: develop`
- Create: `scripts/check-dependencies.mjs` — vérifie que chaque dépendance des `package.json` figure dans `DEPENDENCIES.md` ; branché sur `pnpm lint`

**AC:**
- [ ] `pnpm audit --audit-level high` ne remonte aucune vulnérabilité haute ou critique
- [ ] Ajouter une dépendance absente de `DEPENDENCIES.md` fait échouer `pnpm lint` (EX-T12)
- [ ] Aucun workflow d'auto-merge Dependabot n'existe (implementation_plan.md §Maintenance)

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Export de chaque paquet | `apps/*/src/index.test.ts`, `packages/*/src/index.test.ts` | Les 11 paquets compilent et s'exécutent |
| Lint refuse `any` | vérification `/execute-phase` (fichier temporaire) | EX-T05 |
| Lint refuse `TODO` | vérification `/execute-phase` (fichier temporaire) | EX-T05 |
| commitlint | vérification `/execute-phase` (deux messages) | EX-T02 |
| Registre des dépendances | `scripts/check-dependencies.test.mjs` | EX-T12 |
| Fichiers ignorés | vérification `/execute-phase` (`git check-ignore`) | EX-T08 |
| Clone vierge | `git clone` local dans le scratchpad puis `pnpm install && pnpm build && pnpm lint && pnpm test` | Critère de sortie du lot 0.1 |
