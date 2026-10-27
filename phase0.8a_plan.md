# Phase 0.8a : Images de conteneur et fumée conteneurisée (lot 0.8, chaîne A)

**Branche :** `feat/p0-infra-container-images` (depuis `develop` à jour, `0677a10`). PR ≤ 800 lignes (R1).
**Goal :** des images minimales, non-root et vérifiées pour chaque application déployée, prouvées en CI par une fumée sur les conteneurs eux-mêmes — prérequis des sous-phases 0.8b (Scaleway), 0.8c (Cloudflare, email) et 0.8d (Coolify, déploiement).
**Exigences :** EX-T17.4 (images minimales, non-root), EX-008 (préparation), EX-T03 (Trivy sur images) ; dettes D-013, D-021, D-017 (partiel).

## Découpage du lot 0.8 (validé)

| Sous-phase | Contenu | Prérequis externes |
|---|---|---|
| **0.8a** (ce plan) | Images, fumée conteneurisée, analyse des images | Aucun |
| 0.8b | Terraform Scaleway (Instances, PostgreSQL managé, Object Storage, Redis, secrets) | Compte, projet et clé d'API Scaleway |
| 0.8c | Cloudflare (DNS, TLS, WAF, limitation, recette protégée) ; Scaleway TEM (SPF, DKIM, DMARC) | Domaine, compte Cloudflare |
| 0.8d | Coolify, prévisualisation par PR, déploiement automatique de `develop` en recette | 0.8a à 0.8c ; D-030 levée |

## Décisions à valider (D1-D4)

| # | Décision | Proposition | Alternative |
|---|---|---|---|
| D1 | Images de base | Construction : `node:24-trixie-slim` ; exécution : **`gcr.io/distroless/nodejs24-debian13:nonroot`** (ni shell ni gestionnaire de paquets, utilisateur 65532). Toutes deux épinglées par condensé, mises à jour par Dependabot (délai de 14 jours) | `node:24-alpine` (musl, shell présent) ; `node:24-trixie-slim` en exécution (shell, surface plus large) |
| D2 | Construction dans le monorepo | `turbo prune <app> --docker` (sous-ensemble du dépôt et du lockfile), installation figée, build Turbo ; API : `pnpm deploy --prod` (dépendances de production seules) ; web et admin : sortie Next `standalone` | Copier tout le dépôt et `node_modules` : images bien plus lourdes, plus de surface |
| D3 | Périmètre | Images **api**, **web**, **admin**. Le **worker** n'a pas encore de code : son image arrive avec sa première tâche (lot 1.x, DEBT). ClamAV : image officielle épinglée (déjà dans le compose) | Image worker vide dès maintenant : rien à exécuter, rien à vérifier |
| D4 | Contrôles de santé | API : nouvelle route **`/health/live`** (vivacité, sans dépendance), `/health` restant la disponibilité (base, Redis, stockage). Web et admin : `GET /robots.txt`. Sondes en Node (pas de `curl` dans une image distroless) | Une seule route `/health` : un incident de base redémarrerait en boucle tous les conteneurs |

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | Socle de construction (dockerignore, prune, bases épinglées, Dependabot) | EX-T17.4, R12 |
| 2 | Image API et route de vivacité | EX-T17.4, D4 |
| 3 | Images web et admin (`HOSTNAME`, statiques) | EX-T17.4, D-013 |
| 4 | Refus au démarrage d'un `APP_ENV` absent ou invalide | D-021 |
| 5 | `robots.txt` et icône réels (web, admin) | D-017 (partiel), R10 recette `noindex` |
| 6 | Compose de fumée et tests sur les conteneurs | EX-008 (préparation), D-013 |
| 7 | Job CI `containers` : build, Trivy image, fumée | EX-T03.2-3 |
| 8 | Registres, documentation, dettes | R12, R5 |

## Dependencies

- [ ] `develop` contient les lots 0.1 à 0.7 (vérifié : `0677a10`)
- [ ] Docker Desktop actif (buildx)
- [ ] D1-D4 validées

---

## Tasks

### Task 1: Socle de construction

**What:** règles communes aux trois images : contexte minimal, sous-ensemble du monorepo, bases épinglées et mises à jour.

**Files:**
- Create: `.dockerignore` — exclut `.git`, `node_modules`, `.next`, `dist`, `coverage`, `.env*` (sauf `.env.example`), documents confidentiels, `EX CHART/`
- Create: `infra/docker/images/README.md` — conventions (non-root, condensés, pas de secret au build)
- Modify: `.github/dependabot.yml` — écosystème `docker` sur `infra/docker/images` (délai 14 jours, groupé, sans auto-merge)

**AC:**
- [ ] Aucun `.env`, secret, document confidentiel ni `.git` n'entre dans un contexte de build (test sur `.dockerignore`)
- [ ] Toute ligne `FROM` épinglée par condensé `sha256`, version en commentaire (test)
- [ ] Aucun `ARG`/`ENV` contenant un secret ; aucun `--build-arg` secret

---

### Task 2: Image API et route de vivacité

**What:** image NestJS multi-étapes, dépendances de production seules, exécutée en non-root ; route `/health/live`.

**Files:**
- Create: `infra/docker/images/api.Dockerfile`, `infra/docker/images/healthcheck.mjs` (sonde HTTP en Node, code de sortie)
- Modify: `apps/api/src/health/health.controller.ts` (+ test d'intégration) — `GET /health/live` → 200 sans toucher base, Redis ni stockage
- Modify: `apps/api/package.json` — `start` sans `--env-file` dans l'image (configuration par l'environnement)

**AC:**
- [ ] `/health/live` répond 200 même si la base est injoignable ; `/health` garde son comportement (503 si une dépendance tombe)
- [ ] L'image démarre en utilisateur 65532, sans shell ; `HEALTHCHECK` sur `/health/live`
- [ ] Ni sources TypeScript, ni dépendances de développement, ni `.env` dans l'image (vérifié par inspection du système de fichiers de l'image)
- [ ] Configuration invalide → arrêt immédiat avec un code non nul (comportement du lot 0.3 conservé)

---

### Task 3: Images web et admin

**What:** images Next `standalone` (serveur, `.next/static`, `public/`), non-root, `HOSTNAME=0.0.0.0` (D-013).

**Files:**
- Create: `infra/docker/images/next.Dockerfile` — paramétré par l'application (`APP=web|admin`)

**AC:**
- [ ] `HOSTNAME=0.0.0.0` posé dans l'image : `/` répond 200 et ne boucle pas, même si l'orchestrateur définit `HOSTNAME` (D-013)
- [ ] Polices, CSS et scripts servis depuis l'image ; CSP avec nonce présente sur `/`, `/en` et la 404
- [ ] Utilisateur 65532 ; `HEALTHCHECK` sur `/robots.txt` ; télémétrie Next coupée

---

### Task 4: APP_ENV validé au démarrage

**What:** web et admin refusent de démarrer avec un `APP_ENV` absent (build de production) ou invalide, au lieu de répondre 500 à chaque requête.

**Files:**
- Create: `apps/web/src/instrumentation.ts`, `apps/admin/src/instrumentation.ts` — `register()` appelle `resolveAppEnv`

**AC:**
- [ ] Conteneur lancé sans `APP_ENV`, ou avec `APP_ENV=prod` : arrêt au démarrage, code non nul, message nommant la variable (D-021 close)
- [ ] `APP_ENV` valide : démarrage normal

---

### Task 5: robots.txt et icône

**What:** fichiers racine réels pour web et admin, dépendant de l'environnement.

**Files:**
- Create: `apps/web/src/app/robots.ts` — production : indexation permise sauf espaces privés ; tout autre environnement (recette, prévisualisation, local) : `Disallow: /`
- Create: `apps/admin/src/app/robots.ts` — toujours `Disallow: /`
- Create: `apps/web/src/app/icon.svg`, `apps/admin/src/app/icon.svg` — monogramme « OZ » aux jetons (provisoire jusqu'au logo vectorisé du designer)

**AC:**
- [ ] `/robots.txt` et l'icône répondent 200 (plus de 404 sans CSP sur ces chemins, D-017 partiel)
- [ ] Recette et prévisualisation jamais indexables (R10, données de mineurs à terme)

---

### Task 6: Fumée sur les conteneurs

**What:** les trois images lancées avec PostgreSQL, Redis et S3 jetables, puis testées par Playwright comme en production.

**Files:**
- Create: `infra/docker/compose.smoke.yml` — images construites, `HOSTNAME` hérité arbitraire, `APP_ENV=preview`, réseau interne, ports sur 127.0.0.1
- Create: `e2e/containers.config.ts`, `e2e/containers/*.spec.ts` — `/`, `/en`, `/en/` (D-013), 404, en-têtes, CSP, `/health` et `/health/live` de l'API, `robots.txt`, admin non indexable
- Modify: `package.json` — `test:containers`

**AC:**
- [ ] Toute la fumée web et admin existante passe contre les conteneurs (mêmes specs réutilisées quand c'est possible)
- [ ] L'API conteneurisée répond `/health` à 200 avec ses trois dépendances, et `/health/live`
- [ ] Les conteneurs tournent en non-root (vérifié par `docker inspect` / `id` impossible : utilisateur de l'image)

---

### Task 7: Job CI `containers`

**What:** construction des trois images, analyse Trivy des images, fumée conteneurisée.

**Files:**
- Modify: `.github/workflows/ci.yml` — job `containers` (cache buildx GitHub, `trivy image` HIGH/CRITICAL bloquant, `pnpm test:containers`)
- Modify: `.github/rulesets/*.json`, `scripts/ci-workflow.test.mjs` — sixième contrôle exigé

**AC:**
- [ ] Une vulnérabilité HIGH/CRITICAL dans une image, ou un échec de fumée, rend le job rouge
- [ ] Aucune image poussée vers un registre dans ce lot (publication : 0.8d)
- [ ] Durée totale de la CI toujours raisonnable (jobs en parallèle, cache buildx)

---

### Task 8: Registres, documentation, dettes

**Files:**
- Modify: `DEPENDENCIES.md` (images de base, condensés), `infra/docker/README.md`, `docs/ci.md`, `DEBT.md` (D-013, D-021 closes ; D-017 mise à jour ; image worker à venir), `CHANGELOG.md`

**AC:**
- [ ] Pipeline local et CI verts ; diff mesuré au regard de R1

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Contexte de build | `scripts/docker-images.test.mjs` | `.dockerignore` exclut secrets et confidentiels ; `FROM` épinglés ; utilisateur non-root ; `HEALTHCHECK` présent |
| Vivacité API | `apps/api/test/health.int.test.ts` | `/health/live` 200 sans dépendance ; `/health` inchangé |
| APP_ENV au démarrage | `apps/web/src/instrumentation.test.ts`, `apps/admin/src/instrumentation.test.ts` | Refus d'un `APP_ENV` absent ou invalide |
| robots.txt | `apps/web/src/app/robots.test.ts`, `apps/admin/src/app/robots.test.ts` | Indexation selon l'environnement |
| Fumée conteneurisée | `e2e/containers/*.spec.ts` | Pages, en-têtes, CSP, santé, D-013 sur les images réelles |
| Workflow | `scripts/ci-workflow.test.mjs` | Job `containers` exigé et durci |
