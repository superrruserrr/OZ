# Migrations de base de données

Règle R9 du plan technique et exigence EX-T09 : toute migration est réversible et testée en `up` puis `down`.

## Convention

- Une migration = un dossier `packages/db/prisma/migrations/<horodatage UTC>_<nom_snake_case>/` contenant :
  - `migration.sql` : le `up`, généré par Prisma puis complété à la main si besoin ;
  - `down.sql` : le `down`, **écrit à la main et relu en revue**, qui annule exactement le `up`, dans l'ordre inverse.
- Un `down.sql` absent ou vide fait échouer `pnpm test` (`packages/db/src/migrations.test.ts`).
- Le cycle complet `up` → `down` → `up` est testé sur un PostgreSQL jetable (`packages/db/test/migrations.int.test.ts`) : après les `down`, le schéma redevient celui d'une base vierge.
- Une migration déjà appliquée n'est **jamais** modifiée : on en écrit une nouvelle.
- `down.sql` s'exécute dans la transaction de `db:rollback` : aucune instruction `BEGIN`, `COMMIT`, `ROLLBACK`, `VACUUM`…, ni `CONCURRENTLY` (refusés par le test de convention ; les corps de fonctions, chaînes et identifiants entre guillemets sont ignorés).
- Les extensions (`pgcrypto`, `pg_trgm`, `unaccent`) relèvent du provisionnement de la base (`pnpm dev:up`, Terraform au lot 0.8) : une migration peut les exiger (`CREATE EXTENSION IF NOT EXISTS`) mais son `down` ne les supprime pas, car elles peuvent lui préexister (base managée).
- L'empreinte comparée par le test couvre l'existence des schémas, tables, colonnes (type, nullabilité, défaut), contraintes, index, séquences, vues, types et énumérations, fonctions (par signature), déclencheurs, RLS et politiques. Elle ne compare pas le corps des fonctions, les libellés d'énumération, les longueurs et précisions, les paramètres de séquence, les droits ni les commentaires (DEBT D-026) : un `down.sql` qui restaure une fonction se relit en revue.
- Prisma ne sait pas exprimer RLS, partitionnement, chiffrement de colonne (`pgcrypto`) ni fonctions : ces éléments sont écrits en SQL brut dans `migration.sql`, avec leur annulation dans `down.sql` (TD-002).
- Tables et colonnes en snake_case, tables au pluriel ; modèles Prisma en PascalCase avec `@@map` / `@map` (naming_conventions.md). Clé primaire `id UUID DEFAULT oz_uuid_v7()`, horodatages en `timestamptz` (plan §5.1).

## Créer une migration

1. Modifier `packages/db/prisma/schema.prisma`.
2. Générer le SQL : `pnpm --filter @oz/db exec prisma migrate dev --create-only --name <nom>` (base de développement démarrée par `pnpm dev:up`).
3. Compléter `migration.sql` si nécessaire, écrire `down.sql`.
4. `pnpm test` : convention, cycle `up`/`down` et concordance schéma Prisma ↔ SQL.

Attention : sans `DATABASE_URL`, la CLI Prisma 7 peut sortir en succès sans rien produire (`migrate diff`). `prisma.config.ts` refuse donc toute commande `migrate`, `db` ou `studio` sans URL ; vérifier malgré tout la sortie, pas seulement le code de retour.

## Commandes

| Commande           | Effet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate`  | Applique les migrations en attente (`prisma migrate deploy`)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm db:status`   | État des migrations                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm db:rollback` | Annule la dernière migration : `down.sql` et retrait de sa ligne dans `_prisma_migrations`, en une transaction, sous le verrou de Prisma Migrate. Refusé en production sans `--confirm-production`, si une migration est en échec, ou si l'URL est ambiguë (autre schéma que `public`, paramètre `host`, `dbname`, `options`…). Les paramètres Prisma et SSL (`schema=public`, `connection_limit`, `pool_timeout`, `pgbouncer`, `sslmode`, `sslcert`…) sont acceptés. `APP_ENV` explicite exigé |

En recette et en production, une migration est testée sur une copie de la base avant application (EX-T09.3, lot 0.8).
