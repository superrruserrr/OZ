# @oz/db

Schéma Prisma, migrations réversibles, seeds synthétiques et anonymisation (lot 0.6, TD-002).

## Commandes (depuis la racine)

| Commande                                                                                               | Effet                                                        | Garde-fous                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate`                                                                                      | Applique les migrations en attente                           | —                                                                                                                                                                                                                                                                                         |
| `pnpm db:status`                                                                                       | État des migrations                                          | —                                                                                                                                                                                                                                                                                         |
| `pnpm db:rollback`                                                                                     | Annule la dernière migration (`down.sql`) en une transaction | Refusé en production sans `--confirm-production`                                                                                                                                                                                                                                          |
| `pnpm db:seed`                                                                                         | Réglages synthétiques déterministes, idempotents             | Refusé en recette et en production (R10)                                                                                                                                                                                                                                                  |
| `pnpm --filter @oz/db db:anonymize -- --target-host=<serveur> --target-port=<port> --target-db=<base>` | Anonymise une **copie** de base destinée à la recette        | Refusé en production ; si serveur, port ou base diffèrent de la cible ; si l'URL n'est pas `postgresql://` ou porte un paramètre de redirection (`host`, `dbname`, `options`, schéma autre que `public`…) ; si une colonne, une vue matérialisée ou une table étrangère n'est pas classée |

`DATABASE_URL` vient de l'environnement ; sur le poste, du `.env` racine si elle n'est pas déjà définie. Les commandes `db:rollback`, `db:seed` et `db:anonymize` exigent un `APP_ENV` explicite et ne le prennent jamais dans le `.env` pour compléter une URL exportée à la main.

**Livraison d'une copie anonymisée** : par `pg_dump` / `pg_restore` uniquement, jamais par copie de fichiers ou d'instantané de volume, qui conserveraient les anciennes valeurs dans les lignes mortes (DEBT D-024).

## Règles

- Migrations : voir [docs/db/migrations.md](../../docs/db/migrations.md) (un `down.sql` par migration, cycle `up` → `down` → `up` testé).
- Clés `id UUID DEFAULT oz_uuid_v7()`, horodatages `timestamptz`, tables snake_case au pluriel.
- Toute nouvelle colonne est classée dans `src/anonymize/registry.ts` (sinon `pnpm test` échoue) : `technical` ou une stratégie d'anonymisation.
- Données de test : fabriques de `@oz/testing`, toujours marquées (`@example.test`, `+999…`, `SYN-…`).
