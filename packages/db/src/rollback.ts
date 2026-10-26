import { existsSync, readFileSync } from 'node:fs';
import type { AppEnv } from '@oz/config';
import pg from 'pg';
import { listMigrations, MIGRATIONS_DIR } from './migrations.js';
import { databaseTarget } from './target.js';

// Verrou consultatif de Prisma Migrate : aucun `migrate deploy` ne peut tourner pendant l'annulation.
const PRISMA_MIGRATE_LOCK = 72_707_369;

export interface RollbackOptions {
  readonly databaseUrl: string;
  readonly appEnv: AppEnv;
  /** Obligatoire en production : annuler une migration y détruit des données. */
  readonly confirmProduction?: boolean;
  readonly migrationsDir?: string;
}

/**
 * Annule la dernière migration appliquée (R9) : exécute son `down.sql` puis retire sa ligne de
 * `_prisma_migrations`, dans une seule transaction. Une erreur laisse la base inchangée.
 */
export async function rollbackLast(
  options: RollbackOptions,
): Promise<{ rolledBack: string | null }> {
  if (options.appEnv === 'production' && options.confirmProduction !== true) {
    throw new Error('Annulation refusée en production sans --confirm-production.');
  }
  // Cible sans ambiguïté : pas de ?schema= (ignoré par pg, la table de suivi serait cherchée ailleurs).
  databaseTarget(options.databaseUrl);
  const migrations = listMigrations(options.migrationsDir ?? MIGRATIONS_DIR);
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [PRISMA_MIGRATE_LOCK]);
    const table = await client.query<{ t: string | null }>(
      "SELECT to_regclass('_prisma_migrations')::text AS t",
    );
    const failed =
      table.rows[0]?.t == null
        ? []
        : (
            await client.query<{ migration_name: string }>(
              `SELECT migration_name FROM _prisma_migrations
               WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at`,
            )
          ).rows.map((row) => row.migration_name);
    if (failed.length > 0) {
      throw new Error(
        `Migration en échec à résoudre d'abord (prisma migrate resolve) : ${failed.join(', ')}`,
      );
    }
    const last =
      table.rows[0]?.t == null
        ? undefined
        : (
            await client.query<{ migration_name: string }>(
              `SELECT migration_name FROM _prisma_migrations
               WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
               ORDER BY finished_at DESC, migration_name DESC LIMIT 1`,
            )
          ).rows[0]?.migration_name;
    if (last === undefined) {
      await client.query('ROLLBACK');
      return { rolledBack: null };
    }
    const migration = migrations.find((candidate) => candidate.name === last);
    if (!migration || !existsSync(migration.downPath)) {
      throw new Error(
        `Migration ${last} appliquée mais absente du dépôt : aucun down.sql à exécuter.`,
      );
    }
    await client.query(readFileSync(migration.downPath, 'utf8'));
    await client.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [last]);
    await client.query('COMMIT');
    return { rolledBack: last };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
