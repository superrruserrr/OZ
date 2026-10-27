import { issueWithRetry, isValidOzId, type RandomSource } from '@oz/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppRole, migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// CP-02 sous concurrence : 20 connexions applicatives émettent 10 000 OZ ID dans un espace
// volontairement réduit (32⁴ parties aléatoires), pour forcer des collisions sans risquer d'épuiser
// les dix tirages (au pire 1 % de l'espace pris par tirage : 10⁻²⁰ par émission).
const CONNECTIONS = 20;
const PLAYERS = 10_000;

let db: TestDatabase;
let pool: pg.Pool;
let member: string;

/** Deux premiers symboles fixés à « 00 » : 1 048 576 parties possibles, ≈ 48 collisions attendues. */
const narrowSource: RandomSource = (target) => {
  crypto.getRandomValues(target);
  target.fill(0, 0, 2);
};

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const [user] = await db.query<{ id: string }>(
    `INSERT INTO users (email) VALUES ('load@example.test') RETURNING id`,
  );
  member = user?.id ?? '';
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country) VALUES ('academy', 'Académie de charge', 'CM') RETURNING id`,
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'academy', $2)`,
    [member, org?.id],
  );
  await db.query(
    `INSERT INTO players (organization_id, first_name, last_name, birth_date, nationality, country)
     SELECT $1, 'Joueur', 'Charge ' || n, '2005-01-01', 'CM', 'CM' FROM generate_series(1, $2) AS n`,
    [org?.id, PLAYERS],
  );
  await (await connectAsAppRole(db)).end();
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  pool = new pg.Pool({ connectionString: url.toString(), max: CONNECTIONS });
});
afterAll(async () => {
  await pool.end();
  await db.stop();
});

async function issue(player: string): Promise<{ ozId: string; attempts: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('oz.user_id', $1, true)", [member]);
    const { value, attempts } = await issueWithRetry(async (random) => {
      const { rows } = await client.query<{ oz_id: string | null }>(
        'SELECT oz_issue_oz_id($1, $2) AS oz_id',
        [player, random],
      );
      return rows[0]?.oz_id ?? null;
    }, narrowSource);
    await client.query('COMMIT');
    return { ozId: value, attempts };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('charge en base (CP-02)', () => {
  it(`${String(PLAYERS)} émissions sur ${String(CONNECTIONS)} connexions : aucun doublon`, async () => {
    const players = (await db.query<{ id: string }>('SELECT id FROM players')).map((p) => p.id);
    const queue = [...players];
    const issued: string[] = [];
    let retries = 0;
    await Promise.all(
      Array.from({ length: CONNECTIONS }, async () => {
        for (let player = queue.pop(); player !== undefined; player = queue.pop()) {
          const { ozId, attempts } = await issue(player);
          issued.push(ozId);
          retries += attempts - 1;
        }
      }),
    );
    expect(issued).toHaveLength(PLAYERS);
    expect(new Set(issued).size).toBe(PLAYERS);
    expect(issued.every((ozId) => isValidOzId(ozId))).toBe(true);
    // Espace réduit : les collisions sont nombreuses, toutes absorbées par la reprise.
    expect(retries).toBeGreaterThan(10);
    const [row] = await db.query<{ registry: number; holders: number }>(
      `SELECT (SELECT count(*) FROM oz_id_registry)::int AS registry,
              (SELECT count(DISTINCT oz_id) FROM players)::int AS holders`,
    );
    expect(row).toEqual({ registry: PLAYERS, holders: PLAYERS });
  }, 180_000);
});
