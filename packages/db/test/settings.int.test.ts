import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { readSetting } from '../src/settings.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Réglages techniques (lot 1.3ca, D2) : lus sans contexte utilisateur, table sans RLS.

let db: TestDatabase;
let client: PrismaClient;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  client = createDbClient(db.url);
});
afterAll(async () => {
  await client.$disconnect();
  await db.stop();
});

describe('readSetting', () => {
  it('rend la valeur JSON d’un réglage, null s’il est absent', async () => {
    await db.query(`INSERT INTO system_settings (key, value) VALUES ('rate_limits', $1::jsonb)`, [
      JSON.stringify({ login_ip: { limit: 2, windowSeconds: 60 } }),
    ]);
    expect(await readSetting(client, 'rate_limits')).toEqual({
      login_ip: { limit: 2, windowSeconds: 60 },
    });
    expect(await readSetting(client, 'absent')).toBeNull();
  });

  it('refuse une clé hors format', async () => {
    await expect(readSetting(client, "x'; --")).rejects.toThrow(/clé/);
  });
});
