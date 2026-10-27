import { issueWithRetry, isValidOzId } from '@oz/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppRole, migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// EX-102 n° 8 en base : 1 000 000 d'OZ ID émis par oz_issue_oz_id, dans un même couple (pays,
// année), sur 20 connexions applicatives. Hors CI (durée) ; résultat consigné dans docs/db/migrations.md.
const CONNECTIONS = 20;
const PLAYERS = 1_000_000;

let db: TestDatabase;
let pool: pg.Pool;
let member: string;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const [user] = await db.query<{ id: string }>(
    `INSERT INTO users (email) VALUES ('million@example.test') RETURNING id`,
  );
  member = user?.id ?? '';
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country) VALUES ('academy', 'Académie du million', 'CM') RETURNING id`,
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'academy', $2)`,
    [member, org?.id],
  );
  await db.query(
    `INSERT INTO players (organization_id, first_name, last_name, birth_date, nationality, country)
     SELECT $1, 'Joueur', 'Million ' || n, '2005-01-01', 'CM', 'CM' FROM generate_series(1, $2) AS n`,
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

describe('charge : 1 000 000 d’OZ ID en base', () => {
  it('aucun doublon, reprises comptées', async () => {
    const queue = (await db.query<{ id: string }>('SELECT id FROM players')).map((p) => p.id);
    let retries = 0;
    let invalid = 0;
    const started = Date.now();
    await Promise.all(
      Array.from({ length: CONNECTIONS }, async () => {
        const client = await pool.connect();
        try {
          for (let player = queue.pop(); player !== undefined; player = queue.pop()) {
            await client.query('BEGIN');
            await client.query("SELECT set_config('oz.user_id', $1, true)", [member]);
            const { value, attempts } = await issueWithRetry(async (random) => {
              const { rows } = await client.query<{ oz_id: string | null }>(
                'SELECT oz_issue_oz_id($1, $2) AS oz_id',
                [player, random],
              );
              return rows[0]?.oz_id ?? null;
            });
            await client.query('COMMIT');
            retries += attempts - 1;
            if (!isValidOzId(value)) invalid += 1;
          }
        } finally {
          client.release();
        }
      }),
    );
    const seconds = Math.round((Date.now() - started) / 1000);
    const [row] = await db.query<{ registry: number; holders: number }>(
      `SELECT (SELECT count(*) FROM oz_id_registry)::int AS registry,
              (SELECT count(DISTINCT oz_id) FROM players)::int AS holders`,
    );
    process.stdout.write(`1 000 000 d'OZ ID : ${String(seconds)} s, ${String(retries)} reprises\n`);
    expect(invalid).toBe(0);
    expect(row).toEqual({ registry: PLAYERS, holders: PLAYERS });
  });
});
