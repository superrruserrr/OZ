# Phase 0.2: Environnement de développement conteneurisé

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | `compose.dev.yml` : PostgreSQL, Redis, stockage S3, ClamAV, Mailpit | EX-002, TD-002, TD-004, TD-010 |
| 2 | Volumes nommés, healthchecks, ports documentés et limités à la machine locale | EX-002, EX-T17 |
| 3 | `.env.example` complet (Annexe C + fournisseurs TD-011 à TD-015), testé | EX-T08, EX-T10 |
| 4 | Scripts `pnpm dev:up` / `dev:down` / `dev:reset` / `dev:status` + registre des images | EX-002, EX-T12 |

## Dependencies

- [x] Lot 0.1 mergé dans `develop` (PR #1, `147c992`)
- [ ] **Docker installé sur le poste** (Docker Desktop ou OrbStack, TD-004) avec ≥ 4 Go de mémoire allouée (ClamAV ≈ 2 Go) — action de Gaëtan Wassu
- [ ] Branche `feat/p0-infra-docker-compose-dev` créée depuis `develop` (porte aussi la suppression de `phase0.1_plan.md`)

---

## Tasks

### Task 1: Services de développement

**What:** Décrire dans un seul fichier Compose les cinq services de développement, aux versions alignées sur la recette et la production.

**Files:**
- Create: `infra/docker/compose.dev.yml` — services `postgres`, `redis`, `s3` (stockage compatible S3), `clamav`, `mailpit` ; nom de projet `oz-dev`
- Modify: `infra/docker/README.md` — rôle de chaque service, ports, commandes

**Choix à faire et consigner à l'exécution (vérification des images au moment du lot) :**
- PostgreSQL : version majeure **identique** à celle proposée par Scaleway Managed PostgreSQL (TD-009) ; image officielle `postgres:<majeure>` épinglée sur une version mineure
- Redis : image officielle épinglée sur la version majeure prévue en recette
- Stockage S3 : MinIO (prévu au plan) **si une image officielle maintenue est disponible** ; sinon alternative compatible S3 open source (ex. Garage, SeaweedFS), choix consigné dans `DEPENDENCIES.md` — aucune image non maintenue
- ClamAV : image officielle `clamav/clamav` ; vérifier la disponibilité arm64 (sinon `platform: linux/amd64`, consigné dans `DEBT.md`)
- Mailpit : image officielle `axllent/mailpit`

**AC:**
- [ ] `docker compose -f infra/docker/compose.dev.yml config` valide le fichier (EX-002)
- [ ] Toutes les images sont épinglées sur une version précise (jamais `latest`) (EX-T12)
- [ ] La version majeure de PostgreSQL est celle de Scaleway Managed PostgreSQL, citée dans le README (TD-009)
- [ ] Les extensions `pgcrypto`, `pg_trgm`, `unaccent` sont disponibles dans l'image PostgreSQL (vérifié par requête `CREATE EXTENSION` en Task 4) (EX-101 préparé)

---

### Task 2: Volumes, healthchecks, ports

**What:** Rendre l'environnement durable, observable et non exposé au réseau.

**Files:**
- Modify: `infra/docker/compose.dev.yml` — volumes nommés par service, `healthcheck` par service, `restart: unless-stopped`, ports publiés sur `127.0.0.1` uniquement
- Modify: `infra/docker/README.md` — tableau des ports (PostgreSQL 5432, Redis 6379, S3 9000 + console, ClamAV 3310, Mailpit 1025 SMTP / 8025 web)

**AC:**
- [ ] Chaque service a un healthcheck qui passe à `healthy` (EX-002)
- [ ] Aucun port n'est publié sur `0.0.0.0` : `docker compose config` ne montre que des liaisons `127.0.0.1` (EX-T17)
- [ ] Les données survivent à `dev:down` puis `dev:up` (volumes nommés), et disparaissent avec `dev:reset`
- [ ] Aucun mot de passe en dur dans `compose.dev.yml` : toutes les valeurs viennent de `.env` (EX-T08)

---

### Task 3: `.env.example`

**What:** Fournir le gabarit complet des variables d'environnement, sans aucune valeur secrète, et le tester.

**Files:**
- Create: `.env.example` — Annexe C du plan + variables des fournisseurs retenus : Scaleway TEM (TD-011), Infobip et Twilio (TD-012), Stripe et CinetPay (TD-013), Sentry (TD-014), fournisseur KYC `IDENTITY_VERIFIER_*` (TD-015), `FEATURE_KYC_AUTO_APPROVE_ADULTS=false` (TD-016) ; valeurs de développement local uniquement (identifiants `oz`/`oz` des conteneurs) ; secrets vides
- Create: `scripts/env-example.test.mjs`

**AC:**
- [ ] Toutes les variables lues par `compose.dev.yml` existent dans `.env.example` (EX-T08)
- [ ] Toute variable dont le nom contient `SECRET`, `KEY`, `TOKEN`, `PASSWORD`, `DSN` ou `SID` est vide, sauf les identifiants des conteneurs locaux explicitement listés dans le test (EX-T08)
- [ ] `KYC_MINOR_REQUIRES_DUAL_APPROVAL=true` et l'approbation automatique désactivée par défaut (TD-016)
- [ ] gitleaks ne signale rien sur `.env.example` (règles `oz-jwt-secret-*` comprises)
- [ ] `.env` reste ignoré par Git, `.env.example` est versionné

---

### Task 4: Scripts et registre des images

**What:** Piloter l'environnement en une commande et consigner les images comme toute dépendance.

**Files:**
- Modify: `package.json` — scripts `dev:up` (lève et attend les healthchecks), `dev:down`, `dev:reset` (supprime aussi les volumes, avec confirmation), `dev:status`
- Create: `scripts/dev-env.mjs` — vérifie Docker et `.env` (copie depuis `.env.example` si absent), lance Compose, attend `healthy`, puis contrôle les extensions PostgreSQL ; messages explicites en cas d'échec
- Create: `scripts/dev-env.test.mjs` — tests des fonctions pures (lecture de l'état Compose, délai d'attente)
- Modify: `DEPENDENCIES.md` — nouveau tableau « Images Docker (développement) » : image, version, licence, rôle, alternative envisagée
- Modify: `.github/dependabot.yml` — écosystème `docker` pour `infra/docker` (retiré au lot 0.1)
- Modify: `CHANGELOG.md`

**AC:**
- [ ] Sur macOS, `pnpm dev:up` amène les 5 services à `healthy` en moins de 2 minutes (images déjà téléchargées) (EX-002)
- [ ] Sans Docker, `pnpm dev:up` échoue avec un message qui explique quoi installer (jamais d'échec silencieux)
- [ ] `pnpm dev:reset` demande une confirmation avant de supprimer les volumes
- [ ] `CREATE EXTENSION IF NOT EXISTS pgcrypto, pg_trgm, unaccent` réussit sur la base locale
- [ ] Chaque image figure dans `DEPENDENCIES.md` avec sa licence (EX-T12)
- [ ] `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build` restent verts

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Gabarit d'environnement complet et sans secret | `scripts/env-example.test.mjs` | Task 3 (EX-T08) |
| Lecture de l'état Compose et attente des healthchecks | `scripts/dev-env.test.mjs` | Task 4 |
| Fichier Compose valide, ports sur 127.0.0.1, images épinglées | vérification `/execute-phase` (`docker compose config`) | Tasks 1-2 |
| Démarrage complet < 2 min, 5 services `healthy` | vérification `/execute-phase` (`pnpm dev:up`, chronométré) | Critère de sortie du lot |
| Persistance puis suppression des données | vérification `/execute-phase` (`dev:down`/`dev:up`, puis `dev:reset`) | Task 2 |
| Extensions PostgreSQL disponibles | `scripts/dev-env.mjs` (contrôle post-démarrage) | Task 1 |
