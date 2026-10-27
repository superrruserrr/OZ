import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations, MIGRATIONS_DIR } from '../src/migrations.js';
import { rollbackLast } from '../src/rollback.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
});
afterAll(async () => {
  await db.stop();
});

const applied = async (): Promise<string[]> =>
  (
    await db.query<{ migration_name: string }>(
      'SELECT migration_name FROM _prisma_migrations ORDER BY started_at',
    )
  ).map((row) => row.migration_name);

const tableExists = async (name: string): Promise<boolean> =>
  (await db.query<{ t: string | null }>('SELECT to_regclass($1)::text AS t', [name]))[0]?.t !==
  null;

describe('rollbackLast (db:rollback)', () => {
  it('annule la dernière migration et retire sa trace dans _prisma_migrations', async () => {
    await migrateDeploy(db);
    const last = listMigrations(MIGRATIONS_DIR).at(-1)?.name;
    expect(await applied()).toContain(last);

    const result = await rollbackLast({ databaseUrl: db.url, appEnv: 'local' });
    expect(result.rolledBack).toBe(last);
    expect(await applied()).not.toContain(last);
    // Dernière migration annulée, les précédentes intactes.
    expect(await tableExists('auth_tokens')).toBe(false);
    expect(await tableExists('oz_id_registry')).toBe(true);
    expect(await tableExists('users')).toBe(true);
    expect(await tableExists('system_settings')).toBe(true);
  });

  it('ne fait rien et le dit quand aucune migration n’est appliquée', async () => {
    while ((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack !== null) {
      // Annule les migrations restantes, une par une.
    }
    expect(await tableExists('system_settings')).toBe(false);
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBeNull();
  });

  it('est atomique : un down.sql en erreur laisse la base et l’historique inchangés', async () => {
    await migrateDeploy(db);
    const before = await applied();
    const dir = mkdtempSync(join(tmpdir(), 'oz-broken-down-'));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      const last = listMigrations(dir).at(-1);
      // Première instruction valide, seconde en erreur : rien ne doit subsister de la première.
      writeFileSync(last?.downPath ?? '', 'DROP TABLE "system_settings";\nSELECT 1/0;\n');
      await expect(
        rollbackLast({ databaseUrl: db.url, appEnv: 'local', migrationsDir: dir }),
      ).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(await applied()).toEqual(before);
    expect(await tableExists('system_settings')).toBe(true);
  });

  it('refuse la production sans confirmation explicite, avant toute connexion', async () => {
    await expect(
      rollbackLast({ databaseUrl: 'postgresql://x:y@127.0.0.1:1/none', appEnv: 'production' }),
    ).rejects.toThrow(/production/);
  });

  it('refuse une migration appliquée absente du dépôt (pas de down.sql connu)', async () => {
    await db.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ('x', 'x', '29991231000000_inconnue', now(), now(), 1)`,
    );
    await expect(rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rejects.toThrow(
      /29991231000000_inconnue/,
    );
    await db.query(
      `DELETE FROM _prisma_migrations WHERE migration_name = '29991231000000_inconnue'`,
    );
  });

  it('refuse d’annuler par-dessus une migration en échec (à résoudre d’abord)', async () => {
    await migrateDeploy(db);
    await db.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
       VALUES ('f', 'f', '29991231000001_echec', now(), 0)`,
    );
    try {
      await expect(rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rejects.toThrow(
        /échec.*29991231000001_echec/,
      );
    } finally {
      await db.query(
        `DELETE FROM _prisma_migrations WHERE migration_name = '29991231000001_echec'`,
      );
    }
  });

  it('refuse une URL visant un autre schéma que public', async () => {
    await expect(
      rollbackLast({ databaseUrl: `${db.url}?schema=kyc`, appEnv: 'local' }),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});
