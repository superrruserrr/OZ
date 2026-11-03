import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { playerPhone, playerProfileByOzId, setPlayerVisibility } from '../src/players.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Fiche joueur (lot 1.13a, tâche 1, EX-115 n° 1 à 3) sous la RLS du lecteur, rôle `oz_app` : lecture
// par OZ ID, badge, téléphone à part, visibilité réglée par le titulaire majeur ou le tuteur vérifié.

const KEY = 'k'.repeat(40);

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
const ids: Record<string, string> = {};
const ozIds: Record<string, string> = {};

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

const as = <T>(userId: string, fn: Parameters<typeof withUserContext<T>>[2]) =>
  withUserContext(client, userId, fn);

const id = (name: string): string => ids[name] ?? '';
const oz = (name: string): string => ozIds[name] ?? '';

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());

  const user = async (email: string, phoneVerified = false): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO users (email, email_verified_at, phone_verified_at, phone_hmac, phone_encrypted)
         VALUES ($1, now(), CASE WHEN $2 THEN now() END, CASE WHEN $2 THEN '\\x01'::bytea END,
           CASE WHEN $2 THEN '\\x01'::bytea END)
         RETURNING id`,
        [email, phoneVerified],
      )
    ).id;
  ids.owner = await user('titulaire@example.test', true);
  ids.minorOwner = await user('mineur@example.test', true);
  ids.guardian = await user('tuteur@example.test');
  ids.pendingGuardian = await user('tuteur-attente@example.test');
  ids.federation = await user('federation@example.test');
  ids.stranger = await user('inconnu@example.test');
  ids.admin = await user('admin@example.test');
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [id('admin')]);
  let issued = 0;
  const { id: org } = await one<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ('federation', 'Fédération synthétique', 'CM', 'verified') RETURNING id`,
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id)
     VALUES ($1, 'player', NULL), ($2, 'player', NULL), ($3, 'guardian', NULL),
       ($4, 'guardian', NULL), ($5, 'federation', $6)`,
    [id('owner'), id('minorOwner'), id('guardian'), id('pendingGuardian'), id('federation'), org],
  );
  const guardianRow = async (userId: string, status: string): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
         VALUES ($1, 'Tuteur', 'Synthétique', 'father', 'CM', $2::verification_status) RETURNING id`,
        [userId, status],
      )
    ).id;
  const verifiedGuardian = await guardianRow(id('guardian'), 'verified');
  const waitingGuardian = await guardianRow(id('pendingGuardian'), 'pending');
  const player = async (
    name: string,
    values: [string | null, string, string, string | null],
  ): Promise<void> => {
    const row = await one<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, region,
         city, height_cm, weight_kg, primary_position, verification_status, guardian_id, phone_encrypted, phone_hmac)
       VALUES ($1, 'Joueur', 'Synthétique', $2::date, 'CM', 'CM', 'Centre', 'Yaoundé', 180, 75,
         'striker', $3::verification_status, $4, oz_encrypt('+237690000001', $5),
         oz_blind_index('+237690000001', $5))
       RETURNING id`,
      [...values, KEY],
    );
    ids[name] = row.id;
    // Émis par un administrateur, comme le ferait le back-office (partie aléatoire déterministe).
    ozIds[name] = await app.as(id('admin'), async (c) => {
      const { rows } = await c.query<{ oz_id: string }>('SELECT oz_issue_oz_id($1, $2) AS oz_id', [
        row.id,
        `00000${String(++issued)}`,
      ]);
      return rows[0]?.oz_id ?? '';
    });
  };
  await player('adult', [id('owner'), '1995-03-04', 'verified', null]);
  await player('declaredAdult', [id('stranger'), '1996-05-06', 'declared', null]);
  await player('child', [id('minorOwner'), '2012-06-07', 'verified', verifiedGuardian]);
  await player('waitingChild', [null, '2013-01-02', 'declared', waitingGuardian]);
  await db.query(
    `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
     VALUES ('guardian_profile_publication', 'v1', $1, $2)`,
    [id('child'), verifiedGuardian],
  );
}, 240_000);

afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

describe('playerProfileByOzId', () => {
  it('titulaire : fiche complète, badge, visibilité vide', async () => {
    const profile = await as(id('owner'), (tx) => playerProfileByOzId(tx, oz('adult')));
    expect(profile).toMatchObject({
      id: id('adult'),
      access: { userId: id('owner'), verificationStatus: 'verified', guardianUserId: null },
      data: { ozId: oz('adult'), city: 'Yaoundé', heightCm: 180, primaryPosition: 'striker' },
      kycLevel: 2,
      visibility: {},
    });
  });

  it('badge : 0 email seul, 1 email et téléphone vérifiés, 2 identité vérifiée', async () => {
    const level = async (name: string) =>
      (await as(id('stranger'), (tx) => playerProfileByOzId(tx, oz(name))))?.kycLevel;
    expect(await level('declaredAdult')).toBe(0);
    await db.query(
      `UPDATE users SET phone_verified_at = now(), phone_hmac = '\\x02', phone_encrypted = '\\x02' WHERE id = $1`,
      [id('stranger')],
    );
    expect(await level('declaredAdult')).toBe(1);
  });

  it('tiers : mineur publié lu par la fédération, joueur non vérifié caché', async () => {
    const federation = (name: string) =>
      as(id('federation'), (tx) => playerProfileByOzId(tx, oz(name)));
    expect((await federation('child'))?.access.guardianUserId).toBeNull();
    expect(await federation('waitingChild')).toBeNull();
    expect(await federation('declaredAdult')).toBeNull();
  });

  it('OZ ID mal formé, inconnu ou joueur supprimé : null', async () => {
    const read = (ozId: string) => as(id('owner'), (tx) => playerProfileByOzId(tx, ozId));
    expect(await read('pas-un-oz-id')).toBeNull();
    expect(await read("OZ-CM-26-7K4M9Q-M' OR 1=1 --")).toBeNull();
    expect(await read('OZ-CM-26-7K4M9Q-M')).toBeNull();
    await db.query('UPDATE players SET deleted_at = now() WHERE id = $1', [id('declaredAdult')]);
    expect(await read(oz('declaredAdult'))).toBeNull();
    await db.query('UPDATE players SET deleted_at = NULL WHERE id = $1', [id('declaredAdult')]);
  });
});

describe('playerPhone', () => {
  it('déchiffré pour un lecteur qui voit le joueur ; null s’il est caché', async () => {
    expect(await as(id('owner'), (tx) => playerPhone(tx, id('adult'), KEY))).toBe('+237690000001');
    expect(await as(id('federation'), (tx) => playerPhone(tx, id('waitingChild'), KEY))).toBeNull();
  });
});

describe('setPlayerVisibility', () => {
  const auditOf = (playerId: string) =>
    db.query<{ actor_user_id: string; metadata: unknown; reason: string }>(
      `SELECT actor_user_id::text, metadata, reason FROM audit_log
       WHERE action = 'player.visibility.updated' AND target_id = $1 ORDER BY chain_position`,
      [playerId],
    );

  it('titulaire majeur : blocs fusionnés, audit avec les blocs seuls', async () => {
    expect(
      await as(id('owner'), (tx) => setPlayerVisibility(tx, id('adult'), { physical: false })),
    ).toEqual({ physical: false });
    expect(
      await as(id('owner'), (tx) => setPlayerVisibility(tx, id('adult'), { location: false })),
    ).toEqual({ physical: false, location: false });
    const rows = await auditOf(id('adult'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      actor_user_id: id('owner'),
      metadata: { blocks: { physical: false } },
      reason: 'Visibilité réglée par le titulaire',
    });
    expect(
      (await as(id('owner'), (tx) => playerProfileByOzId(tx, oz('adult'))))?.visibility,
    ).toEqual({ physical: false, location: false });
  });

  it('tuteur vérifié d’un mineur : permis ; le mineur lui-même, un tuteur non vérifié, un tiers : null', async () => {
    expect(
      await as(id('guardian'), (tx) => setPlayerVisibility(tx, id('child'), { sport: false })),
    ).toEqual({ sport: false });
    expect((await auditOf(id('child')))[0]?.reason).toBe('Visibilité réglée par le tuteur');
    expect(
      await as(id('minorOwner'), (tx) => setPlayerVisibility(tx, id('child'), { sport: true })),
    ).toBeNull();
    expect(
      await as(id('pendingGuardian'), (tx) =>
        setPlayerVisibility(tx, id('waitingChild'), { sport: true }),
      ),
    ).toBeNull();
    expect(
      await as(id('federation'), (tx) => setPlayerVisibility(tx, id('adult'), { sport: true })),
    ).toBeNull();
    expect(
      await as(id('owner'), (tx) =>
        setPlayerVisibility(tx, '00000000-0000-4000-8000-000000000001', { sport: true }),
      ),
    ).toBeNull();
    expect(await auditOf(id('child'))).toHaveLength(1);
  });

  it('blocs inconnus ou non booléens : refusés avant la base', async () => {
    await expect(as(id('owner'), (tx) => setPlayerVisibility(tx, id('adult'), {}))).rejects.toThrow(
      'blocs',
    );
    await expect(
      as(id('owner'), (tx) =>
        setPlayerVisibility(tx, id('adult'), { phone: false } as unknown as { sport: boolean }),
      ),
    ).rejects.toThrow('blocs');
  });

  it('appel direct avec une clé en trop : refusé par la contrainte, aucun audit', async () => {
    const before = (await auditOf(id('adult'))).length;
    await expect(
      app.as(id('owner'), (c) =>
        c.query(`SELECT oz_player_set_visibility($1, '{"phone": false}'::jsonb)`, [id('adult')]),
      ),
    ).rejects.toThrow(/players_visibility_blocks_check/);
    expect(await auditOf(id('adult'))).toHaveLength(before);
  });

  it('rôle retiré, tuteur supprimé, compte suspendu : null', async () => {
    const set = (userId: string, playerId: string) =>
      as(userId, (tx) => setPlayerVisibility(tx, playerId, { physical: true }));
    await db.query(`UPDATE user_roles SET deleted_at = now() WHERE user_id = $1`, [id('guardian')]);
    expect(await set(id('guardian'), id('child'))).toBeNull();
    await db.query(`UPDATE user_roles SET deleted_at = NULL WHERE user_id = $1`, [id('guardian')]);
    await db.query(`UPDATE guardians SET deleted_at = now() WHERE user_id = $1`, [id('guardian')]);
    expect(await set(id('guardian'), id('child'))).toBeNull();
    await db.query(`UPDATE guardians SET deleted_at = NULL WHERE user_id = $1`, [id('guardian')]);
    expect(await set(id('guardian'), id('child'))).toEqual({ sport: false, physical: true });
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [id('owner')]);
    expect(await set(id('owner'), id('adult'))).toBeNull();
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [id('owner')]);
    await db.query(`UPDATE user_roles SET deleted_at = now() WHERE user_id = $1`, [id('owner')]);
    expect(await set(id('owner'), id('adult'))).toBeNull();
    await db.query(`UPDATE user_roles SET deleted_at = NULL WHERE user_id = $1`, [id('owner')]);
    await db.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [id('owner')]);
    expect(await set(id('owner'), id('adult'))).toBeNull();
    await db.query(`UPDATE users SET deleted_at = NULL WHERE id = $1`, [id('owner')]);
    expect(await set(id('owner'), id('adult'))).toMatchObject({ physical: true });
  });

  it('jour des 18 ans : le tuteur perd la main, le titulaire la prend', async () => {
    const { id: comer } = await one<{ id: string }>(
      `INSERT INTO users (email, email_verified_at) VALUES ('majeur-du-jour@example.test', now()) RETURNING id`,
    );
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'player')`, [comer]);
    const { id: player } = await one<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
         verification_status, guardian_id)
       SELECT $1, 'Joueur', 'Synthétique', (now() AT TIME ZONE 'UTC')::date - interval '18 years',
         'CM', 'CM', 'declared', g.id FROM guardians g WHERE g.user_id = $2 RETURNING id`,
      [comer, id('guardian')],
    );
    expect(
      await as(id('guardian'), (tx) => setPlayerVisibility(tx, player, { sport: false })),
    ).toBeNull();
    expect(await as(comer, (tx) => setPlayerVisibility(tx, player, { sport: false }))).toEqual({
      sport: false,
    });
  });

  it('en base : contrainte des blocs et écriture directe refusée sous contexte utilisateur', async () => {
    await expect(
      db.query(`UPDATE players SET visibility = '{"phone": false}' WHERE id = $1`, [id('adult')]),
    ).rejects.toThrow(/players_visibility_blocks_check/);
    await expect(
      db.query(`UPDATE players SET visibility = '{"sport": "non"}' WHERE id = $1`, [id('adult')]),
    ).rejects.toThrow(/players_visibility_blocks_check/);
    // Le mineur titulaire de son compte écrirait sinon sa visibilité par `players_owner`.
    await expect(
      app.as(id('minorOwner'), (c) =>
        c.query(`UPDATE players SET visibility = '{"sport": true}' WHERE id = $1`, [id('child')]),
      ),
    ).rejects.toThrow(/oz_player_set_visibility/);
    await expect(
      app.as(id('owner'), (c) =>
        c.query(`SELECT oz_player_set_visibility($1, '{}'::jsonb)`, [id('adult')]),
      ),
    ).rejects.toThrow(/au moins un bloc/);
    await expect(
      app.as(null, (c) =>
        c.query(`SELECT oz_player_set_visibility($1, '{"sport": true}'::jsonb)`, [id('adult')]),
      ),
    ).rejects.toThrow(/contexte utilisateur/);
  });
});
