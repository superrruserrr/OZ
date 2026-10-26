import type { TestDatabase } from './database.js';

// Schémas utilisateur : tout sauf les schémas système (le catalogue, TOAST, tables temporaires).
const USER_SCHEMA = `nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg\\_toast%' AND nspname NOT LIKE 'pg\\_temp%'`;
// Objets apportés par une extension : suivis par la ligne de l'extension elle-même.
const NOT_FROM_EXTENSION = (oid: string): string =>
  `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = ${oid} AND d.deptype = 'e')`;

/**
 * Empreinte du schéma lue dans le catalogue, tous schémas utilisateur : extensions, schémas, tables et
 * colonnes, contraintes, index, séquences, vues, types (énumérations, domaines, composites), fonctions,
 * déclencheurs, RLS (activée, forcée) et politiques. La table de suivi de Prisma est exclue : elle
 * subsiste, vide, après l'annulation de toutes les migrations. Non couverts : droits et commentaires.
 */
export async function schemaSnapshot(db: TestDatabase): Promise<Record<string, string[]>> {
  const list = async (sql: string): Promise<string[]> =>
    (await db.query<{ v: string }>(sql)).map((row) => row.v);
  return {
    extensions: await list(`SELECT extname || ' ' || extversion AS v FROM pg_extension ORDER BY 1`),
    schemas: await list(`SELECT nspname AS v FROM pg_namespace WHERE ${USER_SCHEMA} ORDER BY 1`),
    relations: await list(`
      SELECT n.nspname || '.' || c.relname || ' ' || c.relkind::text
             || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity AS v
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c') AND n.${USER_SCHEMA}
        AND c.relname <> '_prisma_migrations' AND ${NOT_FROM_EXTENSION('c.oid')}
      ORDER BY 1`),
    columns: await list(`
      SELECT table_schema || '.' || table_name || '.' || column_name || ' ' || data_type || ' '
             || is_nullable || ' ' || coalesce(column_default, '-') AS v
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_name <> '_prisma_migrations'
      ORDER BY 1`),
    constraints: await list(`
      SELECT conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(c.oid) AS v
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.${USER_SCHEMA} AND conrelid::regclass::text <> '_prisma_migrations'
      ORDER BY 1`),
    indexes: await list(`
      SELECT indexdef AS v FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema') AND tablename <> '_prisma_migrations'
      ORDER BY 1`),
    types: await list(`
      SELECT n.nspname || '.' || t.typname || ' ' || t.typtype::text AS v
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype IN ('e', 'd', 'c', 'r', 'm') AND n.${USER_SCHEMA}
        AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
        AND ${NOT_FROM_EXTENSION('t.oid')}
      ORDER BY 1`),
    functions: await list(`
      SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS v
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.${USER_SCHEMA} AND ${NOT_FROM_EXTENSION('p.oid')}
      ORDER BY 1`),
    triggers: await list(`
      SELECT tgrelid::regclass || ' ' || tgname || ' ' || pg_get_triggerdef(t.oid) AS v
      FROM pg_trigger t WHERE NOT t.tgisinternal ORDER BY 1`),
    policies: await list(`
      SELECT schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' '
             || coalesce(qual, '-') || ' ' || coalesce(with_check, '-') AS v
      FROM pg_policies ORDER BY 1`),
  };
}
