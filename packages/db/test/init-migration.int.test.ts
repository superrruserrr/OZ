import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});

afterAll(async () => {
  await db.stop();
});

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('migration initiale', () => {
  it('installe pgcrypto, pg_trgm et unaccent', async () => {
    const rows = await db.query<{ extname: string }>('SELECT extname FROM pg_extension');
    expect(rows.map((row) => row.extname)).toEqual(
      expect.arrayContaining(['pgcrypto', 'pg_trgm', 'unaccent']),
    );
  });

  it('oz_uuid_v7() produit des UUID version 7, variante RFC 9562, croissants dans le temps', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const [row] = await db.query<{ id: string }>('SELECT oz_uuid_v7()::text AS id');
      ids.push(row?.id ?? '');
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    for (const id of ids) expect(id).toMatch(UUID_V7);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('remplit l’identifiant et les horodatages de system_settings sans valeur applicative', async () => {
    const [row] = await db.query<{ id: string; created_at: Date; updated_at: Date }>(
      `INSERT INTO system_settings (key, value) VALUES ('probe', '{"ok":true}') RETURNING id, created_at, updated_at`,
    );
    expect(row?.id).toMatch(UUID_V7);
    expect(row?.created_at).toBeInstanceOf(Date);
    expect(row?.updated_at).toBeInstanceOf(Date);
  });

  it('stocke les horodatages en timestamptz et refuse une clé en double', async () => {
    const columns = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'system_settings' ORDER BY ordinal_position`,
    );
    expect(columns).toEqual([
      { column_name: 'id', data_type: 'uuid' },
      { column_name: 'key', data_type: 'text' },
      { column_name: 'value', data_type: 'jsonb' },
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone' },
    ]);
    await expect(
      db.query(`INSERT INTO system_settings (key, value) VALUES ('probe', '{}')`),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
