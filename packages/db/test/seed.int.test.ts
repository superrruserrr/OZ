import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/seed.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});
afterAll(async () => {
  await db.stop();
});

const contents = async (): Promise<{ key: string; value: unknown }[]> =>
  db.query('SELECT key, value FROM system_settings ORDER BY key');

describe('seedDatabase (EX-006.2, EX-T10.1)', () => {
  it('insère des réglages déterministes, marqués comme données synthétiques', async () => {
    await seedDatabase({ databaseUrl: db.url, appEnv: 'local' });
    const rows = await contents();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((row) => row.key === 'seed.dataset')?.value).toMatchObject({
      synthetic: true,
      source: '@oz/testing',
    });
  });

  it('est idempotent : une seconde exécution ne change ni ne duplique rien', async () => {
    const before = await contents();
    await seedDatabase({ databaseUrl: db.url, appEnv: 'preview' });
    expect(await contents()).toEqual(before);
  });

  it.each(['staging', 'production'] as const)('refuse %s avant toute connexion', async (appEnv) => {
    await expect(
      seedDatabase({ databaseUrl: 'postgresql://x:y@127.0.0.1:1/none', appEnv }),
    ).rejects.toThrow(/données synthétiques|R10/);
  });
});
