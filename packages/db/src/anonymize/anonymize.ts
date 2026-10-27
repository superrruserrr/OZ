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
  /** Clés de la copie (jamais celles de la production) : exigées si une colonne chiffrée est réécrite. */
  readonly encryptionKey?: string | undefined;
  readonly blindIndexKey?: string | undefined;
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
  if (strategy.startsWith('encrypted:') || strategy.startsWith('blind_index:')) {
    // Même valeur synthétique pour la colonne chiffrée et son index aveugle.
    const kind = strategy.slice(strategy.indexOf(':') + 1);
    if (kind === 'phone') return person.phone;
    if (kind === 'email') return person.email;
    return person.documentNumber;
  }
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
    case 'empty_json':
      return '{}';
    default:
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
  const strategies = Object.values(registry).flatMap((columns) => Object.values(columns));
  const needsKeys = strategies.some(
    (s) => s.startsWith('encrypted:') || s.startsWith('blind_index:'),
  );
  if (needsKeys && (!options.encryptionKey || !options.blindIndexKey)) {
    throw new Error(
      'Colonnes chiffrées à réécrire : DATABASE_ENCRYPTION_KEY et DATABASE_BLIND_INDEX_KEY de la copie sont exigées.',
    );
  }
  const factory = createPersonFactory(options.seed ?? 20_261_026);
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  let rows = 0;
  try {
    await client.query('BEGIN');
    // Déclencheurs coupés pour cette transaction : journal d'audit immuable, horodatages et gardes
    // métier ne s'appliquent pas à une réécriture de copie (exige un superutilisateur, DEBT D-054).
    await client.query("SET LOCAL session_replication_role = 'replica'");
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
      // Paramètres de clé ajoutés seulement si la table en a besoin (PostgreSQL refuse un paramètre inutilisé).
      const usesKeys = personal.some(
        ([, s]) => s.startsWith('encrypted:') || s.startsWith('blind_index:'),
      );
      const keys = usesKeys ? [options.encryptionKey ?? null, options.blindIndexKey ?? null] : [];
      const encKey = `$${String(personal.length + 2)}`;
      const blindKey = `$${String(personal.length + 3)}`;
      const assign = personal
        .map(([column, strategy], index) => {
          const c = client.escapeIdentifier(column);
          const value = `$${String(index + 2)}`;
          if (strategy === 'birth_date') return `${c} = ${value}::date`;
          if (strategy === 'empty_json') return `${c} = ${value}::jsonb`;
          if (strategy.startsWith('encrypted:'))
            return `${c} = oz_encrypt(${value}::text, ${encKey}::text)`;
          if (strategy.startsWith('blind_index:'))
            return `${c} = oz_blind_index(${value}::text, ${blindKey}::text)`;
          return `${c} = ${value}`;
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
          await client.query(`UPDATE ${t} SET ${assign} WHERE id = $1::uuid`, [
            row.id,
            ...values,
            ...keys,
          ]);
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
