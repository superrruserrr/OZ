# Phase 0.6 : Base de données initiale (chaîne A)

**Branche :** `feat/p0-db-prisma-initial` (depuis `develop` à jour, `7656dc4`). PR ≤ 800 lignes hors lockfile et SQL généré (R1).
**Goal :** Prisma opérationnel avec migrations réversibles et données synthétiques.
**Deliverable :** migration `up` puis `down` testée. **Exigences :** EX-006, EX-T09, EX-T10 (+ plan §5.1, R9, R10, R12).

## Décisions à valider (D1-D5)

| # | Décision | Proposition | Alternative |
|---|---|---|---|
| D1 | Version de Prisma | **7.10.1** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`), dernière stable. L'étiquette npm `latest` de la CLI pointe vers `8.0.0-rc.27` (version candidate) : refusée. Générateur `prisma-client` (ESM, TypeScript), pilote `pg` déjà présent | Prisma 6 (plancher du plan) : fin de vie proche |
| D2 | `down` des migrations | Prisma Migrate n'a pas de `down` : chaque dossier `prisma/migrations/<horodatage>_<nom>/` contient `migration.sql` (up, Prisma) **et** `down.sql` (écrit à la main, relu en revue). Scripts `db:migrate` (up = `prisma migrate deploy`), `db:rollback` (exécute le `down.sql` de la dernière migration dans une transaction puis retire sa ligne de `_prisma_migrations`), `db:status` | Changer d'outil (dbmate, node-pg-migrate) : `down` natif, mais s'écarte du plan (Prisma) |
| D3 | UUIDv7 | Fonction SQL `oz_uuid_v7()` (pgcrypto) en valeur par défaut des clés : valable pour Prisma, le SQL brut et les imports. PostgreSQL 16 n'a pas `uuidv7()` natif (PostgreSQL 18 l'a : à reprendre avec D-005) | Génération côté application (`@default(uuid(7))`) : contournée par tout `INSERT` SQL brut |
| D4 | Données synthétiques | **@faker-js/faker 10.6.0** à graine fixe, plus marqueurs impossibles à confondre avec du réel : emails en `@example.test` (RFC 2606), téléphones sous l'indicatif `+999` (non attribué par l'UIT), numéros de document préfixés `SYN-` | Générateur maison : plus léger, listes de noms à maintenir |
| D5 | Script d'installation de Prisma | **Autoriser `@prisma/engines`** dans `allowBuilds` : il télécharge le moteur de migration (binaire signé, empreinte vérifiée par Prisma) depuis `binaries.prisma.sh`. Consigné dans `DEPENDENCIES.md` | Refuser : téléchargement au premier usage de la CLI, moins traçable |

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | `packages/db` : Prisma 7 configuré, client exporté | EX-006.1, TD-002 |
| 2 | Première migration : extensions, `oz_uuid_v7()`, table technique | EX-006.1, plan §5.1 |
| 3 | Convention et outillage `up` / `down` | EX-T09.1, R9 |
| 4 | Test d'intégration `up` → `down` → `up` | EX-T09.2, EX-006.1 |
| 5 | Factories déterministes dans `packages/testing` | EX-006.2, EX-T10.1 |
| 6 | Seeds synthétiques | EX-006.2, EX-T10.1 |
| 7 | Script d'anonymisation versionné et testé | EX-006.3, EX-T10.2-3 |
| 8 | Registre R12, environnement, documentation | R12, R5 |

## Dependencies

- [ ] `develop` contient les lots 0.1 à 0.5 et le correctif #10 (vérifié : `7656dc4`)
- [ ] Docker Desktop actif (Testcontainers, `postgres:16.15-alpine` comme le compose)
- [ ] D1-D5 validées par Gaëtan Wassu
- [ ] `DATABASE_URL` déjà déclarée dans `.env.example` (lot 0.2)

---

## Tasks

### Task 1: packages/db — Prisma 7 configuré

**What:** installer Prisma 7.10.1, poser `prisma.config.ts` et un client exporté (adaptateur `pg`), générés au build.

**Files:**
- Create: `packages/db/prisma.config.ts` — schéma, dossier des migrations, `DATABASE_URL` lue de l'environnement (jamais en dur)
- Create: `packages/db/prisma/schema.prisma` — générateur `prisma-client` (sortie `src/generated/`, ignorée par Git), source `postgresql`
- Create: `packages/db/src/client.ts` — `createDbClient(databaseUrl)` (adaptateur `@prisma/adapter-pg`)
- Modify: `packages/db/package.json` — dépendances, scripts `generate`, `build` (`prisma generate && tsc`), `typecheck`, `db:*` ; `packages/db/src/index.ts`
- Modify: `.gitignore` (`packages/db/src/generated/`), `turbo.json` (entrées `prisma/**`), `pnpm-workspace.yaml` (D5)

**AC:**
- [ ] `pnpm build` et `pnpm typecheck` passent sur un clone neuf (client généré avant `tsc`)
- [ ] Aucune URL de base en dur ; `createDbClient` refuse une URL vide
- [ ] Le client généré n'est pas versionné

---

### Task 2: Première migration

**What:** migration `0001_init` : extensions `pgcrypto`, `pg_trgm`, `unaccent`, fonction `oz_uuid_v7()`, table technique `system_settings`.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` — `model SystemSetting` (`@@map("system_settings")`) : `id` UUID défaut `dbgenerated("oz_uuid_v7()")`, `key` unique, `value` jsonb, `createdAt` / `updatedAt` en `timestamptz`, `@map` snake_case
- Create: `packages/db/prisma/migrations/<horodatage>_init/migration.sql` — généré par Prisma, complété à la main (extensions, fonction) avant la table
- Create: `packages/db/prisma/migrations/<horodatage>_init/down.sql`

**AC:**
- [ ] `oz_uuid_v7()` produit des UUID de version 7 (quartet `7`, variante RFC 9562) croissants dans le temps
- [ ] `id` de `system_settings` rempli par défaut, sans valeur fournie par l'application
- [ ] Horodatages en `timestamptz` (EX-T21.2) ; noms de tables et colonnes en snake_case pluriel (naming_conventions.md)
- [ ] `down.sql` supprime exactement ce que `migration.sql` crée (table, fonction, extensions)

---

### Task 3: Convention et outillage up / down

**What:** règle « une migration = `migration.sql` + `down.sql` » outillée et vérifiée automatiquement.

**Files:**
- Create: `packages/db/scripts/rollback.ts` — annule la dernière migration appliquée : `down.sql` et suppression de sa ligne `_prisma_migrations` dans **une seule transaction** ; refuse si `APP_ENV=production` sans `--confirm-production`
- Create: `packages/db/src/migrations.ts` — liste et contrôle des dossiers (utilisé par le script et les tests)
- Create: `docs/db/migrations.md` — convention (SQL brut pour RLS, partitionnement, chiffrement ; `down` écrit à la main et relu ; jamais de modification d'une migration appliquée)
- Modify: `packages/db/package.json` — scripts `db:migrate`, `db:rollback`, `db:status`

**AC:**
- [ ] Un dossier de migration sans `down.sql`, ou avec un `down.sql` vide, fait échouer `pnpm test`
- [ ] `db:rollback` est atomique : un `down.sql` en erreur laisse la base et `_prisma_migrations` inchangées
- [ ] `db:rollback` refuse la production sans confirmation explicite

---

### Task 4: Test d'intégration up → down → up

**What:** sur un PostgreSQL 16.15 jetable (Testcontainers), appliquer toutes les migrations, les annuler une à une, puis les réappliquer, en comparant le schéma à chaque étape.

**Files:**
- Create: `packages/db/test/migrations.int.test.ts`
- Create: `packages/db/test/schema-snapshot.ts` — empreinte du schéma (tables, colonnes, types, index, contraintes, fonctions, extensions) lue dans le catalogue

**AC:**
- [ ] Après tous les `down`, le schéma est identique à celui d'une base vierge (EX-T09.2)
- [ ] Après `up` → `down` → `up`, le schéma est identique au premier `up`
- [ ] `prisma migrate diff` entre `schema.prisma` et la base migrée est vide (le schéma Prisma et le SQL ne divergent pas)
- [ ] Le test tourne dans `pnpm test` (même mécanisme que les tests d'intégration de l'API)

---

### Task 5: Factories déterministes

**What:** `packages/testing` fournit des fabriques de personnes et d'organisations synthétiques, reproductibles par graine.

**Files:**
- Create: `packages/testing/src/factories/random.ts` — générateur à graine (faker)
- Create: `packages/testing/src/factories/person.ts` — prénom, nom, date de naissance, email, téléphone, numéro de document, pays (ISO 3166-1)
- Create: `packages/testing/src/factories/organization.ts` — six types d'organisation
- Modify: `packages/testing/src/index.ts`, `packages/testing/package.json`

**AC:**
- [ ] Même graine → mêmes données, octet pour octet ; graines différentes → données différentes
- [ ] Marqueurs synthétiques systématiques : email `@example.test`, téléphone `+999…`, document `SYN-…` (D4)
- [ ] Âges couvrant mineurs et majeurs ; pays pris dans une liste ISO, jamais en dur dans le code métier (EX-T21.1)
- [ ] `isSyntheticPerson()` reconnaît toute personne produite et refuse une donnée sans marqueur

---

### Task 6: Seeds synthétiques

**What:** `pnpm db:seed` remplit une base locale ou de prévisualisation avec des données synthétiques déterministes.

**Files:**
- Create: `packages/db/scripts/seed.ts` — idempotent (relancer ne duplique rien) ; refuse `APP_ENV` `staging` et `production`
- Modify: `packages/db/package.json` (`db:seed`), `package.json` racine (`db:migrate`, `db:seed`, `db:rollback` relayés)

**AC:**
- [ ] Deux exécutions donnent le même contenu (déterminisme et idempotence)
- [ ] Refus explicite en recette et en production (EX-T10.1-2)
- [ ] Seules des données issues de `@oz/testing` (marqueurs synthétiques) sont insérées

---

### Task 7: Script d'anonymisation versionné

**What:** anonymisation déclarative : chaque colonne de chaque table est classée dans un registre, le script applique la stratégie de chaque colonne personnelle.

**Files:**
- Create: `packages/db/src/anonymize/registry.ts` — classement de **toutes** les colonnes : `technical` (conservée) ou une stratégie personnelle (`name`, `birth_date` → année conservée, jour et mois remplacés, `email`, `phone`, `document_number`, `free_text`, `null`)
- Create: `packages/db/src/anonymize/anonymize.ts` — mise à jour par lots, dans une transaction, valeurs de remplacement issues de `@oz/testing`
- Create: `packages/db/scripts/anonymize.ts` — exige `--target-db=<nom>` égal à la base de `DATABASE_URL` ; refuse `APP_ENV=production`
- Create: `packages/db/test/anonymize.int.test.ts`

**AC:**
- [ ] Toute colonne de la base non classée dans le registre fait échouer `pnpm test` (aucune table future ne peut y échapper)
- [ ] Sur une table de test remplie de personnes « réelles » (non marquées), après anonymisation : plus aucun nom, date de naissance exacte, téléphone, email ni numéro de document d'origine (EX-T10.3)
- [ ] Les colonnes techniques et les clés sont conservées ; les relations restent valides
- [ ] Refus de s'exécuter en production ou sur une base différente de la cible déclarée

---

### Task 8: Registre R12, environnement, documentation

**What:** consigner les dépendances, compléter l'environnement et les registres.

**Files:**
- Modify: `DEPENDENCIES.md` (prisma, @prisma/client, @prisma/adapter-pg, @faker-js/faker ; `@prisma/engines` autorisé, D5), `.env.example` (si besoin : `DATABASE_URL` de test), `DEBT.md`, `CHANGELOG.md`
- Create: `packages/db/README.md` — commandes `db:*`, convention, garde-fous

**AC:**
- [ ] `pnpm lint` (contrôle R12) passe
- [ ] Pipeline complet vert : build, typecheck, lint, test (dont intégration), gitleaks ; diff mesuré au regard de R1

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Client et configuration | `packages/db/src/client.test.ts` | URL obligatoire, pas d'URL en dur |
| Convention up/down | `packages/db/src/migrations.test.ts` | `down.sql` présent et non vide pour chaque migration |
| Cycle up → down → up | `packages/db/test/migrations.int.test.ts` | Schéma vierge après `down`, identique après re-`up`, `migrate diff` vide |
| UUIDv7 et horodatages | `packages/db/test/migrations.int.test.ts` | Version 7, ordre temporel, `timestamptz` |
| Rollback atomique | `packages/db/test/rollback.int.test.ts` | Échec du `down` → base inchangée ; refus production |
| Factories | `packages/testing/src/factories/*.test.ts` | Déterminisme, marqueurs synthétiques, répartition des âges |
| Seeds | `packages/db/test/seed.int.test.ts` | Idempotence, refus recette et production |
| Registre d'anonymisation | `packages/db/test/anonymize.int.test.ts` | Toute colonne classée |
| Anonymisation | `packages/db/test/anonymize.int.test.ts` | Aucune donnée d'origine restante, colonnes techniques conservées, garde-fous |
