# Données

- [`er.md`](er.md) : diagramme entités-relations, généré depuis le catalogue PostgreSQL d'une base migrée (EX-101 n° 7). Il ne se modifie pas à la main : après une migration, `pnpm db:migrate` puis `pnpm --filter @oz/db db:er`. Le test `packages/db/test/er-diagram.int.test.ts` échoue tant qu'il n'est pas à jour.
- Conventions de migration, RLS, chiffrement colonne et anonymisation : [`docs/db/migrations.md`](../db/migrations.md).
- Jeu synthétique (`pnpm db:seed`, poste et prévisualisation seulement) : 500 joueurs dont un tiers de mineurs, chacun avec un tuteur et un consentement parental ; 30 organisations (5 par type) ; deux comptes par rôle. Emails en `@example.test`, téléphones en `+999`, pièces préfixées `SYN-`. Sans `DATABASE_ENCRYPTION_KEY` ni `DATABASE_BLIND_INDEX_KEY`, les colonnes chiffrées restent vides.
