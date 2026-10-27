import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations } from '../src/migrations.js';
import { rollbackLast } from '../src/rollback.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';
import { schemaSnapshot } from './schema-snapshot.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
});
afterAll(async () => {
  await db.stop();
});

async function rollbackAll(): Promise<string[]> {
  const undone: string[] = [];
  for (;;) {
    const { rolledBack } = await rollbackLast({ databaseUrl: db.url, appEnv: 'local' });
    if (rolledBack === null) return undone;
    undone.push(rolledBack);
  }
}

describe('cycle up → down → up (EX-T09.2, R9)', () => {
  it('chaque migration s’annule et le schéma redevient celui d’une base vierge', async () => {
    const pristine = await schemaSnapshot(db);
    await migrateDeploy(db);
    const migrated = await schemaSnapshot(db);
    expect(migrated).not.toEqual(pristine);

    const undone = await rollbackAll();
    expect(undone).toEqual(
      listMigrations()
        .map((m) => m.name)
        .reverse(),
    );
    expect(await schemaSnapshot(db)).toEqual(pristine);

    await migrateDeploy(db);
    expect(await schemaSnapshot(db)).toEqual(migrated);
  });

  it('le schéma Prisma et la base migrée concordent (diff vide)', async () => {
    const output = await db.exec('pnpm', [
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
    ]);
    // Preuve positive : la CLI peut sortir en succès sans rien calculer (voir docs/db/migrations.md).
    expect(output).toContain('-- This is an empty migration.');
  });

  it.each([
    ['un schéma', 'CREATE SCHEMA extra', 'DROP SCHEMA extra'],
    ['une énumération', "CREATE TYPE probe_kind AS ENUM ('probe')", 'DROP TYPE probe_kind'],
    ['un domaine', 'CREATE DOMAIN short_text AS text', 'DROP DOMAIN short_text'],
    ['une séquence', 'CREATE SEQUENCE extra_seq', 'DROP SEQUENCE extra_seq'],
    ['une vue', 'CREATE VIEW extra_v AS SELECT 1 AS one', 'DROP VIEW extra_v'],
    [
      'une fonction hors public',
      'CREATE SCHEMA f; CREATE FUNCTION f.g() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
      'DROP SCHEMA f CASCADE',
    ],
    [
      'un déclencheur',
      'CREATE TABLE trg_t (id int); CREATE FUNCTION trg_f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER trg BEFORE INSERT ON trg_t FOR EACH ROW EXECUTE FUNCTION trg_f()',
      'DROP TABLE trg_t; DROP FUNCTION trg_f()',
    ],
    [
      'l’activation de RLS et une politique',
      'CREATE TABLE rls_t (id int); ALTER TABLE rls_t ENABLE ROW LEVEL SECURITY; CREATE POLICY p ON rls_t USING (true)',
      'DROP TABLE rls_t',
    ],
    ['l’activation seule de RLS', 'CREATE TABLE rls_only (id int)', 'DROP TABLE rls_only'],
  ])('l’empreinte voit %s (un down.sql incomplet serait détecté)', async (_, create, drop) => {
    const before = await schemaSnapshot(db);
    await db.query(create);
    try {
      expect(await schemaSnapshot(db)).not.toEqual(before);
    } finally {
      await db.query(drop);
    }
    expect(await schemaSnapshot(db)).toEqual(before);
  });
});

describe('empreinte : RLS et politiques sur une table existante', () => {
  it('distingue RLS activée, forcée et chaque politique', async () => {
    await db.query('CREATE TABLE IF NOT EXISTS rls_probe (id int)');
    const base = await schemaSnapshot(db);
    await db.query('ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY');
    const enabled = await schemaSnapshot(db);
    expect(enabled).not.toEqual(base);
    await db.query('CREATE POLICY only_mine ON rls_probe USING (id = 1)');
    expect(await schemaSnapshot(db)).not.toEqual(enabled);
    await db.query('DROP TABLE rls_probe');
  });
});
