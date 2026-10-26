# Phase 0.7 : Intégration continue (chaîne A)

**Branche :** `feat/p0-ci-github-actions` (depuis `develop` à jour, `ac7123f`). PR ≤ 800 lignes (R1).
**Goal :** aucune PR ne passe si un seul contrôle échoue.
**Deliverable :** PR de test bloquée par un contrôle volontairement cassé. **Exigences :** EX-007, EX-T03, EX-T06 (+ R2, R6, R8, R12 ; dettes D-001, D-004, D-018, D-025).

## Décisions à valider (D1-D5)

| # | Décision | Proposition | Alternative |
|---|---|---|---|
| D1 | Analyse statique (CodeQL, EX-T03.2) | Le dépôt est **privé** : le *code scanning* (CodeQL) n'y est pas disponible sans l'option payante GitHub Code Security (vérifié dans les réglages du dépôt). Proposition : **Semgrep Community Edition** dans la CI (gratuit, règles `p/typescript`, `p/nodejs`, `p/owasp-top-ten`, `p/secrets`), bloquant sur toute alerte de sévérité ERROR | Souscrire GitHub Code Security pour garder CodeQL (≈ 30 $ / contributeur actif / mois) ; rendre le dépôt public : exclu (NDA) |
| D2 | Protection de branches (tâche 5) | Sur un dépôt privé, les règles de protection ne sont **appliquées** qu'avec **GitHub Pro** (≈ 4 $ / mois, compte personnel) ou une organisation Team. Sans cela, le livrable (« PR bloquée ») est impossible. Proposition : passer le compte en Pro (action de Gaëtan Wassu) ; règles versionnées dans `.github/rulesets/`, importées par Gaëtan | Rester en gratuit : CI visible mais non bloquante, livrable non atteint (consigné en dette) |
| D3 | Version de Node en CI | **Node 24 LTS** lue dans `.nvmrc` ; `engines` passe à `>=24` — clôt D-001 (le poste passe aussi en Node 24) | Garder Node 22 : D-001 reste ouverte |
| D4 | E2E et prévisualisation (EX-T03.2) | Fumée Playwright (lot 0.4) **dans ce lot**, sur les builds autonomes ; l'environnement de prévisualisation par PR reste au lot 0.8 (Coolify) | Reporter Playwright au lot 0.8 |
| D5 | Outils de sécurité | `gitleaks` 8.30.1 (binaire officiel, empreinte vérifiée, **tout l'historique Git**), `pnpm audit --audit-level=high`, **Trivy** (`fs` : dépendances, mauvaises configurations, secrets ; HIGH/CRITICAL bloquants) ; toutes les actions épinglées par empreinte de commit | Actions tierces épinglées par étiquette : plus simple, vulnérable à la réécriture d'étiquette |

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | Workflow de base : install, cache, format, lint, commitlint, typecheck | EX-007.1/3, EX-T03.2, R2 |
| 2 | Tests unitaires et d'intégration avec seuils de couverture | EX-T06, EX-T03.2, R6 |
| 3 | Build de toutes les apps et fumée E2E Playwright | EX-T03.2, D4 |
| 4 | Contrôles de sécurité bloquants | EX-T03.2-3, R8, R12, D1, D5 |
| 5 | Vérification des migrations up → down → up | EX-T03.2, EX-T09.2 |
| 6 | Durcissement et test du workflow lui-même | EX-T03, supply chain |
| 7 | Protection de branches versionnée | EX-T03.1, EX-007.2, D2 |
| 8 | Preuve : PR cassée bloquée ; dettes et registres | Deliverable, D-001, D-004, D-018, D-025 |

## Dependencies

- [ ] `develop` contient les lots 0.1 à 0.6 (vérifié : `ac7123f`)
- [ ] D1-D5 validées ; pour D2, compte GitHub en Pro (ou décision de rester en gratuit)
- [ ] Minutes GitHub Actions disponibles (dépôt privé : 2 000 min/mois en gratuit, 3 000 en Pro)

---

## Tasks

### Task 1: Workflow de base

**What:** `.github/workflows/ci.yml` déclenché sur PR et push vers `develop`/`main` : installation figée, caches pnpm et Turbo, format, lint (dont contrôle R12), commitlint de tous les commits de la PR, typecheck.

**Files:**
- Create: `.github/workflows/ci.yml` — job `quality`
- Modify: `package.json` (`engines` ≥ 24, D3), `turbo.json` si besoin (cache local `.turbo` restauré par `actions/cache`)

**AC:**
- [ ] `pnpm install --frozen-lockfile` ; aucun script d'installation hors `allowBuilds` (R12)
- [ ] Caches pnpm (store) et Turbo restaurés par clé de lockfile (EX-007.3)
- [ ] `format:check`, `lint`, `typecheck` ; commitlint sur l'intervalle `base..head` de la PR (corps ≤ 100 caractères, portées autorisées)
- [ ] Node lu dans `.nvmrc` (24) ; `engines` aligné ; D-001 close

---

### Task 2: Tests et seuils de couverture

**What:** tests unitaires et d'intégration (Testcontainers sur le Docker du runner), seuils R6 bloquants.

**Files:**
- Modify: `vitest.config.ts` — seuils : 70 % global ; 80 % domaine et services (`apps/api/src/**/*.service.ts`, `packages/core/src/**`) ; 100 % authentification, KYC, facturation (`apps/api/src/{auth,kyc,billing}/**`, `packages/auth/src/**`) ; exclusions : client Prisma généré, CLI, tests, fichiers de configuration
- Modify: `.github/workflows/ci.yml` — job `test` (couverture publiée en artefact)

**AC:**
- [ ] Un seuil non atteint fait échouer le job (vérifié par un test sur la configuration, et par la PR de preuve)
- [ ] Les seuils ciblés valent dès que des fichiers correspondent ; sans fichier correspondant, ils ne bloquent pas à tort
- [ ] Les tests Testcontainers (API, base) tournent en CI, images identiques au poste

---

### Task 3: Build et fumée E2E

**What:** build de toutes les apps (Turbo) et fumée Playwright + axe sur les serveurs autonomes web et admin.

**Files:**
- Modify: `.github/workflows/ci.yml` — job `build-e2e` (navigateur Chromium installé avec ses dépendances, rapport Playwright en artefact en cas d'échec)

**AC:**
- [ ] `pnpm build` (toutes apps) puis `pnpm test:e2e` ; échec d'un seul test → job rouge
- [ ] Aucune télémétrie (Next, Turbo) envoyée depuis la CI

---

### Task 4: Contrôles de sécurité bloquants

**What:** gitleaks sur tout l'historique, audit des dépendances, Trivy, analyse statique (D1).

**Files:**
- Modify: `.github/workflows/ci.yml` — job `security`
- Create: `scripts/install-gitleaks.sh` — télécharge la release officielle 8.30.1, vérifie l'empreinte SHA-256 publiée, échoue sinon
- Create: `.semgrepignore` (si D1 = Semgrep), `trivy.yaml` (sévérités HIGH, CRITICAL ; `--exit-code 1`)
- Modify: `.gitleaks.toml` — retirer l'exclusion `.next/` (D-018), l'analyse CI portant sur l'historique Git

**AC:**
- [ ] gitleaks analyse `git log` complet de la branche (`fetch-depth: 0`) ; un secret dans n'importe quel commit fait échouer (D-004 close)
- [ ] `pnpm audit --audit-level=high` bloquant (EX-T03.3)
- [ ] Trivy `fs` : vulnérabilités, mauvaises configurations (Dockerfile, compose, workflow) et secrets HIGH/CRITICAL bloquants
- [ ] Analyse statique bloquante sur les alertes de sévérité ERROR (D1)

---

### Task 5: Vérification des migrations

**What:** sur un service PostgreSQL 16.15 du runner (extensions provisionnées), `db:migrate` → `db:rollback` jusqu'à vide → `db:migrate`, puis `db:status` à jour.

**Files:**
- Modify: `.github/workflows/ci.yml` — job `migrations`
- Create: `scripts/ci-migrations.sh` — boucle de rollback, sortie vérifiée (pas seulement le code de retour, piège Prisma documenté)

**AC:**
- [ ] Toute migration dont le `down` échoue ou ne s'applique pas fait échouer le job (EX-T09.2)
- [ ] `APP_ENV` explicite (`local`), aucun secret réel ; D-025 réévaluée

---

### Task 6: Durcissement et test du workflow

**What:** moindre privilège et chaîne d'approvisionnement des actions, vérifiés par un test du dépôt.

**Files:**
- Create: `scripts/ci-workflow.test.mjs`
- Modify: `.github/workflows/ci.yml` — `permissions: contents: read` par défaut, `concurrency` (annule les exécutions dépassées), `timeout-minutes` par job, `persist-credentials: false`

**AC:**
- [ ] Toute action tierce épinglée par empreinte de commit (40 caractères), version en commentaire (D5)
- [ ] Aucune permission en écriture ; aucun `pull_request_target` ; aucun secret exposé aux PR
- [ ] Les jobs exigés par la protection de branches existent tous (noms stables)
- [ ] Dependabot (`github-actions`) met à jour ces empreintes, sans auto-merge

---

### Task 7: Protection de branches versionnée

**What:** règles de `develop` et `main` décrites en JSON, importées dans GitHub par Gaëtan Wassu (D2).

**Files:**
- Create: `.github/rulesets/develop.json`, `.github/rulesets/main.json` — PR obligatoire, 1 approbation, contrôles exigés à jour avec la base, historique linéaire (squash), suppression et poussée forcée interdites ; `main` : uniquement depuis `release/*` et `hotfix/*` (§2.3)
- Create: `docs/ci.md` — contrôles, durée, reproduction locale, import des règles

**AC:**
- [ ] Les contrôles exigés listés dans les règles = jobs du workflow (test de cohérence)
- [ ] Règles importées et actives (constat dans l'interface GitHub)

---

### Task 8: Preuve et clôture

**What:** une PR de test volontairement cassée est bloquée ; registres et dettes mis à jour.

**Files:**
- Modify: `DEBT.md` (D-001, D-004, D-018 closes ; D-025 réévaluée), `DEPENDENCIES.md` (actions et outils de CI), `CHANGELOG.md`

**AC:**
- [ ] PR de test (test unitaire cassé, puis secret factice détecté) : contrôles rouges et bouton de merge bloqué (capture), PR fermée sans merge
- [ ] Une PR saine passe tous les contrôles (temps total relevé)
- [ ] Pipeline local vert ; diff mesuré au regard de R1

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Workflow durci | `scripts/ci-workflow.test.mjs` | SHA épinglés, permissions minimales, pas de `pull_request_target`, jobs attendus, timeouts |
| Cohérence règles ↔ jobs | `scripts/ci-workflow.test.mjs` | Contrôles exigés = jobs existants |
| Seuils de couverture | `scripts/coverage-config.test.mjs` | 70 / 80 / 100 % sur les bons globs, exclusions |
| Installation gitleaks | `scripts/install-gitleaks.sh` (exécuté en CI) | Empreinte vérifiée, échec sinon |
| Migrations | `scripts/ci-migrations.sh` (job `migrations`) | up → down → up, sortie vérifiée |
| Preuve de blocage | PR de test | Merge impossible avec un contrôle rouge |
