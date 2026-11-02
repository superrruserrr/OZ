import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { playerRecord } from '../src/players.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Lecture d'un joueur en entrée de décision CASL (lot 1.4b, tâche 2), sous la RLS du lecteur.

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let ids: Record<string, string> = {};

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

const read = (userId: string, playerId: string) =>
  withUserContext(client, userId, (tx) => playerRecord(tx, playerId));

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());

  const user = async (email: string): Promise<string> =>
    (await one<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])).id;
  const [owner, guardian, pendingGuardian, federation, stranger] = [
    await user('titulaire@example.test'),
    await user('tuteur@example.test'),
    await user('tuteur-attente@example.test'),
    await user('federation@example.test'),
    await user('inconnu@example.test'),
  ];
  const { id: org } = await one<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ('federation', 'Fédération synthétique', 'CM', 'verified') RETURNING id`,
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id)
     VALUES ($1, 'player', NULL), ($2, 'guardian', NULL), ($3, 'guardian', NULL), ($4, 'federation', $5)`,
    [owner, guardian, pendingGuardian, federation, org],
  );
  const guardianRow = async (userId: string, status: string): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
         VALUES ($1, 'Tuteur', 'Synthétique', 'father', 'CM', $2::verification_status) RETURNING id`,
        [userId, status],
      )
    ).id;
  const verifiedGuardian = await guardianRow(guardian, 'verified');
  const waitingGuardian = await guardianRow(pendingGuardian, 'pending');
  const player = async (values: unknown[]): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
           verification_status, guardian_id, organization_id, deleted_at)
         VALUES ($1, 'Joueur', 'Synthétique', $2::date, 'CM', 'CM', $3::verification_status, $4, $5, $6)
         RETURNING id`,
        values,
      )
    ).id;
  const adult = await player([owner, '1995-03-04', 'verified', null, null, null]);
  const child = await player([null, '2015-06-07', 'verified', verifiedGuardian, null, null]);
  const waitingChild = await player([null, '2016-01-02', 'declared', waitingGuardian, null, null]);
  const deleted = await player([null, '1990-01-01', 'verified', null, null, new Date()]);
  await db.query(
    `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
     VALUES ('guardian_profile_publication', 'v1', $1, $2)`,
    [child, verifiedGuardian],
  );
  ids = {
    owner,
    guardian,
    pendingGuardian,
    federation,
    stranger,
    adult,
    child,
    waitingChild,
    deleted,
  };
});

afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

describe('playerRecord', () => {
  it('rend l’entrée de CASL du titulaire, date de naissance comprise', async () => {
    expect(await read(ids.owner ?? '', ids.adult ?? '')).toEqual({
      userId: ids.owner,
      birthDate: new Date('1995-03-04T00:00:00.000Z'),
      verificationStatus: 'verified',
      guardianUserId: null,
      organizationId: null,
      testedByOrganizationIds: [],
      hasPublicationConsent: false,
      checkedAt: expect.any(Date) as Date,
    });
  });

  it('rend l’instant de la base auquel la RLS a jugé la ligne', async () => {
    const [{ now }] = (await db.query<{ now: Date }>('SELECT now() AS now')) as [{ now: Date }];
    const record = await read(ids.owner ?? '', ids.adult ?? '');
    expect(Math.abs((record?.checkedAt.getTime() ?? 0) - now.getTime())).toBeLessThan(60_000);
  });

  it('le tuteur vérifié se reconnaît ; le consentement de publication est lu', async () => {
    const record = await read(ids.guardian ?? '', ids.child ?? '');
    expect(record?.guardianUserId).toBe(ids.guardian);
    expect(record?.hasPublicationConsent).toBe(true);
  });

  it('un tiers lit le mineur publié sans apprendre qui est son tuteur', async () => {
    const record = await read(ids.federation ?? '', ids.child ?? '');
    expect(record?.guardianUserId).toBeNull();
    expect(record?.hasPublicationConsent).toBe(true);
  });

  it('un tuteur non vérifié n’est pas reconnu comme tuteur', async () => {
    const record = await read(ids.pendingGuardian ?? '', ids.waitingChild ?? '');
    expect(record).not.toBeNull();
    expect(record?.guardianUserId).toBeNull();
  });

  it('ligne refusée par la RLS, supprimée, inexistante ou identifiant mal formé : null, sans erreur', async () => {
    expect(await read(ids.stranger ?? '', ids.adult ?? '')).toBeNull();
    expect(await read(ids.federation ?? '', ids.deleted ?? '')).toBeNull();
    expect(await read(ids.owner ?? '', '00000000-0000-7000-8000-000000000000')).toBeNull();
    expect(await read(ids.owner ?? '', 'pas-un-uuid')).toBeNull();
    expect(await read(ids.owner ?? '', "x' OR '1'='1")).toBeNull();
  });
});
