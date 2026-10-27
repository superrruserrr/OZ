import { isValidOzId, OZ_ID_MAX_ATTEMPTS, OzIdExhaustedError, type RandomSource } from '@oz/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { issueOzId, issueOzIdWithSource } from '../src/oz-id.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Émission de l'OZ ID par l'application (lot 1.2, tâche 4) : client Prisma sous le rôle applicatif,
// contexte utilisateur posé, reprise sur collision.

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let member: string;
let club: string;

/** Source qui rejoue la même partie aléatoire `000000` puis, si demandé, `111111`. */
const replay =
  (...values: number[]): RandomSource =>
  (target) => {
    target.fill(values.shift() ?? values.at(-1) ?? 0);
  };

async function insertPlayer(country = 'CM'): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO players (organization_id, first_name, last_name, birth_date, nationality, country)
     VALUES ($1, 'Joueur', 'Synthétique', '2005-01-01', 'CM', $2) RETURNING id`,
    [club, country],
  );
  return row?.id ?? '';
}

const issue = (player: string, source?: RandomSource) =>
  withUserContext(client, member, (tx) => issueOzIdWithSource(tx, player, source));

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const [user] = await db.query<{ id: string }>(
    `INSERT INTO users (email) VALUES ('member@example.test') RETURNING id`,
  );
  member = user?.id ?? '';
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country) VALUES ('academy', 'Académie synthétique', 'CM') RETURNING id`,
  );
  club = org?.id ?? '';
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'academy', $2)`,
    [member, club],
  );
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());
});
afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

describe('issueOzId', () => {
  it('émet un OZ ID valide sous le rôle applicatif et le pose sur le joueur', async () => {
    const player = await insertPlayer('GH');
    const result = await issue(player);
    expect(isValidOzId(result.ozId)).toBe(true);
    expect(result.ozId).toMatch(/^OZ-GH-/);
    expect(result.attempts).toBe(1);
    const [row] = await db.query<{ oz_id: string }>('SELECT oz_id FROM players WHERE id = $1', [
      player,
    ]);
    expect(row?.oz_id).toBe(result.ozId);
  });

  it('tire à nouveau quand la partie aléatoire est prise', async () => {
    const first = await insertPlayer();
    const second = await insertPlayer();
    const taken = await issue(first, replay(0));
    expect(taken.ozId).toMatch(/^OZ-CM-\d{2}-000000-/);
    const result = await issue(second, replay(0, 0, 1));
    expect(result.attempts).toBe(3);
    expect(result.ozId).toMatch(/^OZ-CM-\d{2}-111111-/);
  });

  it(`abandonne après ${String(OZ_ID_MAX_ATTEMPTS)} tirages pris, sans OZ ID partiel`, async () => {
    const holder = await insertPlayer();
    await issue(holder, replay(2));
    const player = await insertPlayer();
    await expect(issue(player, replay(2))).rejects.toBeInstanceOf(OzIdExhaustedError);
    const [row] = await db.query<{ oz_id: string | null }>(
      'SELECT oz_id FROM players WHERE id = $1',
      [player],
    );
    expect(row?.oz_id).toBeNull();
  });

  it('refuse une seconde émission pour le même joueur, sans réserver d’OZ ID', async () => {
    const player = await insertPlayer();
    await issue(player);
    const before = await db.query('SELECT 1 FROM oz_id_registry');
    await expect(issue(player)).rejects.toThrow(/déjà émis/);
    expect(await db.query('SELECT 1 FROM oz_id_registry')).toHaveLength(before.length);
  });

  it('une transaction annulée après l’émission n’a rien réservé : tout ou rien', async () => {
    const player = await insertPlayer();
    let issued = '';
    await expect(
      withUserContext(client, member, async (tx) => {
        issued = (await issueOzId(tx, player)).ozId;
        throw new Error('échec applicatif après l’émission');
      }),
    ).rejects.toThrow(/échec applicatif/);
    expect(isValidOzId(issued)).toBe(true);
    expect(await db.query('SELECT 1 FROM oz_id_registry WHERE oz_id = $1', [issued])).toEqual([]);
    const [row] = await db.query<{ oz_id: string | null }>(
      'SELECT oz_id FROM players WHERE id = $1',
      [player],
    );
    expect(row?.oz_id).toBeNull();
  });

  it('refuse un identifiant de joueur qui n’est pas un UUID, avant toute requête', async () => {
    await expect(issue("x'; DROP TABLE players; --")).rejects.toThrow(/UUID attendu/);
  });
});
