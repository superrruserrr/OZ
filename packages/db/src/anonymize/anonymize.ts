import type { AppEnv } from '@oz/config';
import { createPersonFactory, type SyntheticPerson } from '@oz/testing';
import pg from 'pg';
import { databaseTarget } from '../target.js';
import {
  ANONYMIZATION_REGISTRY,
  EXEMPT_TABLES,
  type ColumnStrategy,
  type Registry,
} from './registry.js';

const BATCH = 1000;

type PersonalRow = Record<string, string | null> & { id: string };
const FREE_TEXT = '[anonymisé]';

/** Colonnes de la base (`table.colonne`) absentes du registre, triées. */
export async function unclassifiedColumns(
  databaseUrl: string,
  registry: Registry,
): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await listUnclassified(client, registry);
  } finally {
    await client.end();
  }
}

/**
 * Lu dans le catalogue système (pg_class, pg_attribute), visible quels que soient les droits du rôle :
 * information_schema ne montre que les objets accessibles et seulement le schéma interrogé. Tables de
 * tous les schémas utilisateur, qualifiées hors `public` ; une table partitionnée est classée par son
 * parent ; une vue matérialisée ou une table étrangère est refusée (copie non anonymisable).
 */
async function listUnclassified(client: pg.Client, registry: Registry): Promise<string[]> {
  const { rows } = await client.query<{
    name: string;
    relkind: string;
    column_name: string | null;
  }>(
    `SELECT CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS name,
            c.relkind::text AS relkind, a.attname AS column_name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE c.relkind IN ('r', 'p', 'm', 'f') AND NOT c.relispartition
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp%'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     ORDER BY 1, 3`,
  );
  const problems = new Set<string>();
  for (const row of rows) {
    if (EXEMPT_TABLES.includes(row.name)) continue;
    if (row.relkind === 'm')
      problems.add(`${row.name} : vue matérialisée (copie non anonymisable)`);
    else if (row.relkind === 'f')
      problems.add(`${row.name} : table étrangère (hors de la base copiée)`);
    else if (row.column_name !== null && registry[row.name]?.[row.column_name] === undefined) {
      problems.add(`${row.name}.${row.column_name}`);
    }
  }
  return [...problems];
}

export interface AnonymizeOptions {
  readonly databaseUrl: string;
  readonly appEnv: AppEnv;
  /**
   * Serveur, port et base visés, à répéter explicitement : une URL de production exportée par erreur,
   * même vers une base du même nom ou par un tunnel sur le même hôte, est refusée.
   */
  readonly targetHost: string;
  readonly targetPort: number;
  readonly targetDb: string;
  readonly registry?: Registry;
  readonly seed?: number;
}

/** Date de naissance de même année, jour et mois différents de l'original. */
function shiftedBirthDate(original: string, person: SyntheticPerson): string {
  const year = original.slice(0, 4);
  const candidate = `${year}${person.birthDate.slice(4)}`;
  const date = candidate.endsWith('-02-29') ? `${year}-02-28` : candidate;
  return date === original
    ? `${year}${original.slice(4) === '-01-15' ? '-06-15' : '-01-15'}`
    : date;
}

function replacement(
  strategy: ColumnStrategy,
  original: string | null,
  person: SyntheticPerson,
): string | null {
  if (original === null || strategy === 'null') return null;
  switch (strategy) {
    case 'first_name':
      return person.firstName;
    case 'last_name':
      return person.lastName;
    case 'birth_date':
      return shiftedBirthDate(original, person);
    case 'email':
      return person.email;
    case 'phone':
      return person.phone;
    case 'document_number':
      return person.documentNumber;
    case 'free_text':
      return FREE_TEXT;
    case 'technical':
      return original;
  }
}

/**
 * Anonymise une copie de base destinée à la recette (EX-T10.2) : chaque colonne personnelle reçoit une
 * valeur synthétique (@oz/testing), dans une transaction. Refusé en production, sur un serveur ou une base
 * autres que la cible déclarée, ou si une colonne n'est pas classée dans le registre.
 */
export async function anonymizeDatabase(options: AnonymizeOptions): Promise<{ rows: number }> {
  if (options.appEnv === 'production') {
    throw new Error('Anonymisation refusée en production : elle s’exécute sur une copie isolée.');
  }
  const target = databaseTarget(options.databaseUrl);
  if (
    target.host !== options.targetHost ||
    target.port !== options.targetPort ||
    target.database !== options.targetDb
  ) {
    throw new Error(
      `Base ${target.host}:${String(target.port)}/${target.database} différente de la cible déclarée (--target-host, --target-port, --target-db).`,
    );
  }
  const registry = options.registry ?? ANONYMIZATION_REGISTRY;
  const factory = createPersonFactory(options.seed ?? 20_261_026);
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  let rows = 0;
  try {
    await client.query('BEGIN');
    const unclassified = await listUnclassified(client, registry);
    if (unclassified.length > 0) {
      throw new Error(
        `Colonnes non classées dans le registre d’anonymisation : ${unclassified.join(', ')}`,
      );
    }
    for (const [table, columns] of Object.entries(registry)) {
      const personal = Object.entries(columns).filter(([, strategy]) => strategy !== 'technical');
      if (personal.length === 0) continue;
      if (columns.id !== 'technical')
        throw new Error(`${table} : colonne id requise pour anonymiser.`);
      const [schema, name] = table.includes('.') ? table.split('.', 2) : ['public', table];
      const t = `${client.escapeIdentifier(schema ?? 'public')}.${client.escapeIdentifier(name ?? table)}`;
      const select = personal
        .map(([column, strategy]) => {
          const c = client.escapeIdentifier(column);
          return strategy === 'birth_date'
            ? `to_char(${c}, 'YYYY-MM-DD') AS ${c}`
            : `${c}::text AS ${c}`;
        })
        .join(', ');
      const assign = personal
        .map(([column, strategy], index) => {
          const c = client.escapeIdentifier(column);
          return `${c} = $${String(index + 2)}${strategy === 'birth_date' ? '::date' : ''}`;
        })
        .join(', ');

      let last: string | null = null;
      for (;;) {
        const batch: pg.QueryResult<PersonalRow> = await client.query<PersonalRow>(
          `SELECT id::text AS id, ${select} FROM ${t}
           WHERE $1::uuid IS NULL OR id > $1::uuid ORDER BY id LIMIT ${String(BATCH)}`,
          [last],
        );
        for (const row of batch.rows) {
          const originals = personal.map(([column]) => row[column] ?? null);
          let person = factory.person();
          // Un nom tiré au hasard peut coïncider avec l'original : on retire.
          while (
            originals.some((value) => value === person.firstName || value === person.lastName)
          ) {
            person = factory.person();
          }
          const values = personal.map(([column, strategy]) =>
            replacement(strategy, row[column] ?? null, person),
          );
          await client.query(`UPDATE ${t} SET ${assign} WHERE id = $1::uuid`, [row.id, ...values]);
          rows += 1;
        }
        if (batch.rows.length < BATCH) break;
        last = batch.rows.at(-1)?.id ?? null;
      }
    }
    await client.query('COMMIT');
    return { rows };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
