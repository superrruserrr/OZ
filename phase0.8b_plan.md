# Phase 0.8b : Infrastructure Scaleway en code (lot 0.8, chaîne A)

**Branche :** `feat/p0-infra-terraform-scaleway` (depuis `develop` à jour, `f2238d3`). PR ≤ 800 lignes (R1).
**Goal :** la recette existe sur Scaleway (Paris), décrite entièrement en Terraform revu par PR : réseau privé, instance d'accueil de Coolify, PostgreSQL et Redis managés, stockage objets versionné, secrets — sans aucun secret dans le dépôt.
**Exigences :** EX-008.1, .5 et .6 (partiel : recette ; prévisualisation et production en 0.8d), EX-T23.1-2 (partiel), R8, TD-002, TD-009, TD-010.

## Découpage du lot 0.8 (rappel)

| Sous-phase | Contenu | État |
|---|---|---|
| 0.8a | Images, fumée conteneurisée, analyse des images | Mergée (`497509c`) |
| **0.8b** (ce plan) | Terraform Scaleway | — |
| 0.8c | Cloudflare (DNS, TLS, WAF, recette protégée) ; Scaleway TEM (SPF, DKIM, DMARC) | Domaine, compte Cloudflare |
| 0.8d | Coolify, prévisualisation par PR, déploiement automatique de `develop` | D-030 levée |

## Décisions à valider (D1-D6)

| # | Décision | Proposition | Alternative |
|---|---|---|---|
| D1 | Outil et état | **Terraform** (plan §4, versions épinglées, `.terraform.lock.hcl` multi-plateformes). État distant dans un bucket Scaleway dédié, privé et versionné, créé par une racine `bootstrap/` à état local non versionné | OpenTofu (licence MPL, chiffrement natif de l'état) : écart au plan technique |
| D2 | Périmètre appliqué | **Recette seule appliquée** dans ce lot. La production est écrite avec les mêmes modules et validée (`validate`, `test`), mais appliquée au lot 0.11, avant J1 (coût mensuel évité tant qu'elle ne sert pas) | Appliquer les deux dès maintenant |
| D3 | Redis (TD-009, à trancher) | **Redis managé Scaleway** en recette et en production : TLS, réseau privé, aucune exploitation. Prévisualisations : conteneur Coolify (0.8d) | Conteneur Coolify partout : moins cher, mais persistance et mises à jour à notre charge |
| D4 | Exposition | Base et Redis **sans point d'accès public**, joignables uniquement par le réseau privé. Instance : 80/443 entrants seulement (restreints aux IP Cloudflare en 0.8c), SSH par clé depuis une IP d'administration déclarée, aucun mot de passe | Accès public filtré par IP : surface plus large |
| D5 | Copie de secours hors région (EX-T23.2) | Scaleway n'a **pas de réplication native** entre régions : buckets de secours créés à Amsterdam dans ce lot ; copie planifiée (rclone, tâche Coolify) au lot 0.8d, consignée en DEBT | Copie depuis le poste : non automatisée |
| D6 | Secrets | **Scaleway Secret Manager**, un chemin par environnement (`/oz/staging/…`). Terraform crée les valeurs générées (mots de passe de la base, secrets JWT) : elles figurent dans l'état, protégé en conséquence (bucket privé, versionné, accès restreint à la clé Terraform) | Valeurs saisies à la main dans la console : non reproductibles |

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | Socle Terraform (versions, état distant, structure, contrôles CI) | EX-008.5, R8, D1 |
| 2 | Réseau privé et instance de recette | EX-008.6, D4 |
| 3 | PostgreSQL managé | TD-002, TD-009, EX-T23.1, D4 |
| 4 | Redis managé | TD-002, D3 |
| 5 | Stockage objets et accès applicatif | TD-010, EX-T23.2, D5 |
| 6 | Secrets | R8, EX-008.5, D6 |
| 7 | Application de la recette et vérifications | EX-008.1 (partiel) |
| 8 | Runbooks, registres, documentation, dettes | EX-T23.3, EX-T23.5, R5, R12 |

## Dependencies

- [ ] `develop` contient 0.1 à 0.8a (vérifié : `f2238d3`)
- [ ] D1-D6 validées
- [ ] **Côté Gaëtan :** compte Scaleway, organisation, projet `oz` ; application IAM `oz-terraform` et sa clé d'API, chargées dans le shell du poste (`SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`) — jamais saisies par Claude, jamais dans le dépôt
- [ ] **Côté Gaëtan :** Terraform installé sur le poste ; clé SSH publique d'administration ; IP d'administration
- [ ] Toute commande `terraform apply` ou `destroy` (ressources facturées) confirmée par Gaëtan au moment de l'exécuter

---

## Tasks

### Task 1: Socle Terraform

**What:** structure, versions épinglées, état distant et contrôles automatiques, sans identifiant dans le code.

**Files:**
- Create: `infra/terraform/bootstrap/` — bucket d'état (privé, versionné, versions anciennes conservées 90 jours)
- Create: `infra/terraform/modules/{network,instance,postgres,redis,storage,secrets}/`, `infra/terraform/envs/{staging,production}/` (`versions.tf`, `backend.tf`, `main.tf`, `variables.tf`, `outputs.tf`)
- Modify: `.gitignore` — `.terraform/`, `*.tfstate*`, `*.tfvars` (sauf `*.tfvars.example`), `crash.log`
- Modify: `scripts/install-ci-tools.sh` — Terraform à l'empreinte vérifiée
- Modify: `.github/workflows/ci.yml` (job `quality` ou `security`) — `terraform fmt -check`, `validate` (`-backend=false`), `terraform test` ; Trivy misconfig voit désormais `infra/terraform`

**AC:**
- [ ] Terraform et le provider Scaleway épinglés à une version exacte ; lockfile versionné avec les empreintes darwin_arm64 et linux_amd64
- [ ] Le fournisseur lit ses identifiants dans l'environnement ; aucun identifiant, aucune IP, aucun secret dans les fichiers versionnés (gitleaks et test)
- [ ] La CI vérifie format, validité et tests Terraform sans identifiant Scaleway ; Trivy misconfig HIGH/CRITICAL bloquant sur `infra/terraform`
- [ ] Région `fr-par` imposée par défaut ; toute ressource porte les étiquettes `oz`, `env:<environnement>`, `managed-by:terraform`

---

### Task 2: Réseau privé et instance de recette

**What:** VPC et réseau privé, instance d'accueil de Coolify durcie au démarrage.

**Files:**
- Create: `modules/network/` (VPC, réseau privé, passerelle publique si nécessaire pour la sortie), `modules/instance/` (instance, IP publique, groupe de sécurité, clé SSH, `cloud-init.yaml`)

**AC:**
- [ ] Groupe de sécurité : entrant refusé par défaut ; 80/443 ouverts (liste d'IP paramétrable pour 0.8c) ; 22 limité aux IP d'administration ; Coolify (8000) jamais exposé publiquement
- [ ] `cloud-init` : connexion SSH par clé uniquement, `root` sans mot de passe, mises à jour de sécurité automatiques, pare-feu local cohérent
- [ ] Image Ubuntu LTS ou Debian stable, type d'instance en variable ; volumes chiffrés si l'offre le permet
- [ ] L'instance est attachée au réseau privé

---

### Task 3: PostgreSQL managé

**What:** base managée PostgreSQL 16 de recette, joignable par le seul réseau privé, sauvegardée.

**Files:**
- Create: `modules/postgres/` — instance, base `oz`, utilisateurs, réglages, sauvegardes

**AC:**
- [ ] Version majeure identique au local et à la CI (16) ; haute disponibilité en variable (désactivée en recette, activée en production)
- [ ] Aucun point d'accès public : réseau privé uniquement ; TLS exigé
- [ ] Sauvegardes automatiques quotidiennes, rétention 30 jours (EX-T23.1) ; capacité de restauration à un instant donné vérifiée dans la documentation Scaleway et consignée (RPO 15 min) — à défaut, dette explicite
- [ ] Deux rôles : `oz_migrator` (DDL, migrations) et `oz_app` (lecture et écriture des données seulement) ; mots de passe générés, longs, jamais en sortie Terraform en clair

---

### Task 4: Redis managé

**What:** Redis managé de recette, sur réseau privé, chiffré en transit.

**Files:**
- Create: `modules/redis/`

**AC:**
- [ ] Version 7 (la plus proche de 7.4 offerte par Scaleway), réseau privé seul, TLS activé, mot de passe généré
- [ ] Politique d'éviction compatible BullMQ (`noeviction`)

---

### Task 5: Stockage objets et accès applicatif

**What:** buckets séparés et versionnés, accès de l'application limité à ses buckets.

**Files:**
- Create: `modules/storage/` — buckets `identity-documents`, `media`, `exports` par environnement (Paris) ; buckets de secours correspondants (Amsterdam) ; application IAM `oz-<env>-app` et politique ; politique de bucket

**AC:**
- [ ] Versioning activé partout ; ACL privée ; aucun bucket public (EX-110 : accès par URL signées de 5 min)
- [ ] Cycle de vie : versions anciennes expirées après 30 jours ; uploads multiparties incomplets nettoyés
- [ ] L'application de l'environnement n'accède qu'à ses buckets (politique de bucket) ; la recette ne peut lire aucun bucket de production
- [ ] Buckets de secours à Amsterdam créés, vides ; copie planifiée renvoyée à 0.8d (DEBT)

---

### Task 6: Secrets

**What:** toutes les valeurs dont l'application a besoin, rangées dans Secret Manager, prêtes pour Coolify (0.8d).

**Files:**
- Create: `modules/secrets/` — `DATABASE_URL` (rôle `oz_app`), `DATABASE_MIGRATION_URL` (rôle `oz_migrator`), `REDIS_URL`, `S3_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (64 octets aléatoires, jamais partagés entre environnements)

**AC:**
- [ ] Un chemin par environnement ; noms alignés sur `.env.example` et la validation de configuration de l'API (lot 0.3)
- [ ] Aucune sortie Terraform ne révèle de secret (sorties sensibles ou absentes) ; aucun secret dans les journaux de la CI
- [ ] Rotation documentée (trimestrielle, §6.9)

---

### Task 7: Application de la recette et vérifications

**What:** créer réellement la recette, après confirmation de Gaëtan, et prouver ses propriétés de sécurité.

**Files:**
- Create: `infra/terraform/envs/staging/terraform.tfvars.example`

**AC:**
- [ ] `bootstrap` puis `envs/staging` appliqués après confirmation ; un second `plan` ne montre aucun changement
- [ ] Vérifié sur les ressources réelles : base et Redis sans point d'accès public ; versioning actif ; sauvegardes planifiées ; SSH refusé hors IP d'administration ; secrets présents dans Secret Manager
- [ ] `envs/production` : `validate` et `test` verts, aucun `apply` (D2)

---

### Task 8: Runbooks, registres, documentation, dettes

**Files:**
- Create: `docs/runbooks/restauration-postgres.md`, `docs/runbooks/reconstruction-infrastructure.md` (EX-T23.5 : exécutables par quelqu'un qui n'a pas conçu le système)
- Modify: `infra/terraform/README.md` (bootstrap, procédure d'application, identifiants), `technology_decisions.md` (TD-019 : Redis managé ; D1-D6), `DEPENDENCIES.md` (Terraform, provider), `docs/ci.md`, `DEBT.md` (copie hors région, production non appliquée, test de restauration mensuel à planifier), `CHANGELOG.md`

**AC:**
- [ ] Pipeline local et CI verts ; diff mesuré au regard de R1

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Propriétés de sécurité | `infra/terraform/modules/*/tests/*.tftest.hcl` (fournisseur simulé) | Pas d'accès public à la base ni à Redis ; versioning ; rétention 30 j ; règles du groupe de sécurité ; sorties non sensibles |
| Analyse de configuration | Trivy misconfig (CI) | Aucune alerte HIGH/CRITICAL sur `infra/terraform` |
| Hygiène du dépôt | `scripts/terraform.test.mjs` | Versions épinglées, lockfile multi-plateformes, `.gitignore`, aucun identifiant ni IP en dur |
| Workflow | `scripts/ci-workflow.test.mjs` | Étapes Terraform présentes, sans secret Scaleway en CI |
| Recette réelle | vérification manuelle consignée (Task 7) | Propriétés de sécurité sur les ressources créées |
