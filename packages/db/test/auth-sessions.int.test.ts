import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, resetPassword, requestPasswordReset, verifyEmail } from '../src/auth.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { withUserContext } from '../src/session-context.js';
import {
  listSessions,
  logoutSession,
  openSession,
  revokeAllSessions,
  revokeSession,
  sessionAccess,
  rotateSession,
} from '../src/sessions.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Sessions (lot 1.3b) : fonctions privilégiées sous le rôle applicatif, liste et révocation sous RLS.

const HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
const DAY = 86_400;
const TTL = 30 * DAY;
const FAMILY_TTL = 90 * DAY;

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let counter = 0;

const hash = (): string => createHash('sha256').update(randomBytes(32)).digest('hex');

/** Compte actif et vérifié. */
async function account(): Promise<string> {
  const verify = hash();
  const id = await registerUser(client, {
    email: `session-${String(++counter)}@example.test`,
    passwordHash: HASH,
    tokenHash: verify,
    ttlSeconds: DAY,
  });
  if (id === null) throw new Error('inscription refusée');
  expect(await verifyEmail(client, verify)).toBe(true);
  return id;
}

async function open(
  userId: string,
  device: string | null = 'Firefox · macOS',
  ip = '203.0.113.42',
) {
  const tokenHash = hash();
  const session = await openSession(client, {
    userId,
    tokenHash,
    device,
    ip,
    ttlSeconds: TTL,
    familyTtlSeconds: FAMILY_TTL,
  });
  if (session === null) throw new Error('ouverture refusée');
  return { ...session, tokenHash };
}

const rotate = (tokenHash: string, newTokenHash = hash(), ip: string | null = '198.51.100.7') =>
  rotateSession(client, { tokenHash, newTokenHash, ip, ttlSeconds: TTL });

/** Rotation vieillie au-delà de la fenêtre de grâce (10 s) : un rejeu redevient un vol. */
const ageRotation = (tokenHash: string) =>
  age(
    "UPDATE sessions SET revoked_at = revoked_at - interval '11 seconds' WHERE refresh_token_hash = $1",
    [tokenHash],
  );

const familyRows = (familyId: string) =>
  db.query<{
    refresh_token_hash: string;
    revoked_at: Date | null;
    revoked_reason: string | null;
    ip: string | null;
    user_agent: string | null;
    expires_at: Date;
    family_expires_at: Date | null;
  }>(
    `SELECT refresh_token_hash, revoked_at, revoked_reason, ip::text AS ip, user_agent, expires_at,
       family_expires_at FROM sessions WHERE family_id = $1 ORDER BY created_at, id`,
    [familyId],
  );

/** Données de test : vieillit une session malgré ses déclencheurs (garde, created_at figé). */
async function age(sql: string, values: unknown[]): Promise<void> {
  await db.query('ALTER TABLE sessions DISABLE TRIGGER USER');
  try {
    await db.query(sql, values);
  } finally {
    await db.query('ALTER TABLE sessions ENABLE TRIGGER USER');
  }
}

const valid = async (familyId: string) =>
  (await familyRows(familyId)).filter((row) => row.revoked_at === null);

const audit = async (userId: string) =>
  (
    await db.query<{ action: string; metadata: unknown; reason: string }>(
      `SELECT action, metadata, reason FROM audit_log WHERE actor_user_id = $1 ORDER BY chain_position`,
      [userId],
    )
  ).filter((row) => row.action.startsWith('user.session.'));

beforeAll(async () => {
  db = await startDatabase();
  await db.query('CREATE ROLE oz_app NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  await db.query('GRANT oz_app TO oz_app_test');
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

describe('connexion (oz_auth_open_session)', () => {
  it('ouvre une famille neuve, IP tronquée, journalisée sans IP ni appareil', async () => {
    const user = await account();
    const session = await open(user, 'Firefox · macOS', '203.0.113.42');
    const rows = await familyRows(session.familyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ip).toBe('203.0.113.0/24');
    expect(rows[0]?.user_agent).toBe('Firefox · macOS');
    expect(rows[0]?.refresh_token_hash).toBe(session.tokenHash);
    const family = rows[0]?.family_expires_at?.getTime() ?? 0;
    expect(family - (rows[0]?.expires_at.getTime() ?? 0)).toBeCloseTo(60 * DAY * 1000, -4);
    const entries = await audit(user);
    expect(entries.map((row) => row.action)).toEqual(['user.session.opened']);
    expect(JSON.stringify(entries)).not.toMatch(/203\.0\.113|Firefox|[0-9a-f]{64}/);
  });

  it('tronque une IPv6 en /48', async () => {
    const session = await open(await account(), null, '2001:db8:abcd:1234::1');
    expect((await familyRows(session.familyId))[0]?.ip).toBe('2001:db8:abcd::/48');
  });

  it('chaque connexion ouvre une famille distincte', async () => {
    const user = await account();
    expect((await open(user)).familyId).not.toBe((await open(user)).familyId);
  });

  it('signale un appareil déjà vu sur le compte depuis 90 jours', async () => {
    const user = await account();
    expect((await open(user, 'Safari · iOS')).knownDevice).toBe(false);
    expect((await open(user, 'Safari · iOS')).knownDevice).toBe(true);
    expect((await open(user, 'Chrome · Android')).knownDevice).toBe(false);
    expect((await open(user, null)).knownDevice).toBe(false);
    const other = await account();
    expect((await open(other, 'Safari · iOS')).knownDevice).toBe(false);
    await age(
      `UPDATE sessions SET created_at = now() - interval '91 days', expires_at = now() + interval '1 day'
       WHERE user_id = $1`,
      [other],
    );
    expect((await open(other, 'Safari · iOS')).knownDevice).toBe(false);
  });

  it('refuse un compte en attente, suspendu, clos ou supprimé (EX-103 n° 9)', async () => {
    const pending = await registerUser(client, {
      email: `attente-${String(++counter)}@example.test`,
      passwordHash: HASH,
      tokenHash: hash(),
      ttlSeconds: DAY,
    });
    const input = (userId: string) => ({
      userId,
      tokenHash: hash(),
      device: null,
      ip: null,
      ttlSeconds: TTL,
      familyTtlSeconds: FAMILY_TTL,
    });
    expect(await openSession(client, input(pending ?? ''))).toBeNull();
    for (const change of ["status = 'suspended'", "status = 'closed'", 'deleted_at = now()']) {
      const user = await account();
      await db.query(`UPDATE users SET ${change} WHERE id = $1`, [user]);
      expect(await openSession(client, input(user))).toBeNull();
    }
  });
});

describe('rotation (oz_auth_rotate_session, EX-103 n° 4)', () => {
  it('consomme le jeton et le remplace dans la même famille', async () => {
    const user = await account();
    const session = await open(user);
    const next = hash();
    const result = await rotate(session.tokenHash, next, '198.51.100.7');
    expect(result).toMatchObject({ outcome: 'rotated', userId: user, familyId: session.familyId });
    const rows = await familyRows(session.familyId);
    expect(rows.map((row) => row.revoked_reason)).toEqual(['rotated', null]);
    expect(rows[1]?.refresh_token_hash).toBe(next);
    expect(rows[1]?.ip).toBe('198.51.100.0/24');
    expect(rows[1]?.user_agent).toBe('Firefox · macOS');
    // Pas d'audit par rotation : seul l'événement de sécurité compte.
    expect((await audit(user)).map((row) => row.action)).toEqual(['user.session.opened']);
  });

  it('au plus un jeton valide par famille, rotation après rotation', async () => {
    const session = await open(await account());
    let current = session.tokenHash;
    for (let i = 0; i < 5; i += 1) {
      const next = hash();
      expect((await rotate(current, next)).outcome).toBe('rotated');
      current = next;
      expect(await valid(session.familyId)).toHaveLength(1);
    }
  });

  it('jeton inconnu ou expiré : invalid, rien ne change', async () => {
    expect(await rotate(hash())).toEqual({ outcome: 'invalid' });
    const session = await open(await account());
    await age(
      `UPDATE sessions SET expires_at = now() - interval '1 second', created_at = now() - interval '2 days'
       WHERE family_id = $1`,
      [session.familyId],
    );
    expect(await rotate(session.tokenHash)).toEqual({ outcome: 'invalid' });
    expect(await valid(session.familyId)).toHaveLength(1);
  });

  it('ne prolonge jamais la famille au-delà de son terme absolu (D1)', async () => {
    const session = await open(await account());
    await age(
      `UPDATE sessions SET family_expires_at = now() + interval '2 days', expires_at = now() + interval '1 day'
       WHERE family_id = $1`,
      [session.familyId],
    );
    const result = await rotate(session.tokenHash);
    expect(result.outcome).toBe('rotated');
    const rows = await valid(session.familyId);
    expect(rows[0]?.expires_at.getTime()).toBe(rows[0]?.family_expires_at?.getTime());
    expect((rows[0]?.expires_at.getTime() ?? 0) - Date.now()).toBeLessThan(2 * DAY * 1000 + 5000);
  });

  it('refuse de prolonger un compte suspendu, clos ou supprimé depuis la connexion', async () => {
    for (const change of ["status = 'suspended'", "status = 'closed'", 'deleted_at = now()']) {
      const user = await account();
      const session = await open(user);
      await db.query(`UPDATE users SET ${change} WHERE id = $1`, [user]);
      expect(await rotate(session.tokenHash)).toEqual({ outcome: 'invalid' });
    }
  });
});

describe('réutilisation (EX-103 n° 5, test de non-régression)', () => {
  it('un jeton consommé qui revient révoque toute la famille et journalise', async () => {
    const user = await account();
    const session = await open(user);
    const next = hash();
    await rotate(session.tokenHash, next);
    await ageRotation(session.tokenHash);
    // Le voleur rejoue l'ancien jeton alors que le titulaire détient le jeton courant, encore valide.
    expect(await rotate(session.tokenHash)).toEqual({
      outcome: 'reuse',
      userId: user,
      familyId: session.familyId,
    });
    const rows = await familyRows(session.familyId);
    expect(rows.map((row) => row.revoked_reason)).toEqual(['rotated', 'reuse_detected']);
    // Le jeton courant du titulaire ne sert plus.
    expect(await rotate(next)).toEqual({ outcome: 'invalid' });
    expect((await audit(user)).map((row) => row.action)).toEqual([
      'user.session.opened',
      'user.session.reuse_detected',
    ]);
  });

  it('ne touche pas les autres familles du compte', async () => {
    const user = await account();
    const victim = await open(user);
    const other = await open(user);
    await rotate(victim.tokenHash);
    await ageRotation(victim.tokenHash);
    await rotate(victim.tokenHash);
    expect(await valid(other.familyId)).toHaveLength(1);
  });

  it('famille déjà fermée : invalid, sans nouvelle alerte', async () => {
    const user = await account();
    const session = await open(user);
    const next = hash();
    await rotate(session.tokenHash, next);
    expect(await logoutSession(client, next)).toBe(user);
    expect(await rotate(session.tokenHash)).toEqual({ outcome: 'invalid' });
    expect((await audit(user)).map((row) => row.action)).toEqual([
      'user.session.opened',
      'user.session.revoked',
    ]);
  });

  it('rejeu concurrent d’une rotation légitime, après la grâce : la famille tombe (verrou de famille)', async () => {
    for (let i = 0; i < 10; i++) {
      const user = await account();
      const session = await open(user);
      const current = hash();
      await rotate(session.tokenHash, current);
      await ageRotation(session.tokenHash);
      const [legit, replay] = await Promise.all([rotate(current), rotate(session.tokenHash)]);
      expect(replay.outcome).toBe('reuse');
      expect(['rotated', 'invalid']).toContain(legit.outcome);
      expect(await valid(session.familyId)).toHaveLength(0);
    }
  });

  it('déconnexion concurrente d’une rotation : la famille tombe toujours', async () => {
    for (let i = 0; i < 10; i++) {
      const session = await open(await account());
      await Promise.all([rotate(session.tokenHash), logoutSession(client, session.tokenHash)]);
      // Dans les deux ordres, la famille est fermée.
      expect(await valid(session.familyId)).toHaveLength(0);
    }
  });

  it('famille révoquée par le titulaire pendant une rotation : aucune ligne ne survit', async () => {
    for (let i = 0; i < 10; i++) {
      const user = await account();
      const session = await open(user);
      await Promise.all([
        rotate(session.tokenHash),
        withUserContext(client, user, (tx) => revokeAllSessions(tx)),
      ]);
      const live = await valid(session.familyId);
      // Ordre rotation → révocation : tout tombe ; ordre inverse : la rotation est refusée.
      expect(live).toHaveLength(0);
    }
  });

  it('20 rotations concurrentes du même jeton : une seule réussit, les autres réessaient (grâce)', async () => {
    const session = await open(await account());
    const results = await Promise.all(Array.from({ length: 20 }, () => rotate(session.tokenHash)));
    const outcomes = results.map((result) => result.outcome);
    expect(outcomes.filter((outcome) => outcome === 'rotated')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'raced')).toHaveLength(19);
    expect(await valid(session.familyId)).toHaveLength(1);
  });
});

describe('fenêtre de grâce de 10 s (D-132, ADR-010)', () => {
  it('deux onglets : le jeton tout juste consommé reçoit « raced », sans révocation ni jeton', async () => {
    const user = await account();
    const session = await open(user);
    const next = hash();
    await rotate(session.tokenHash, next);
    expect(await rotate(session.tokenHash)).toEqual({ outcome: 'raced' });
    // Rien n'est émis ni révoqué : la famille garde son seul jeton courant, qui tourne encore.
    expect(await valid(session.familyId)).toHaveLength(1);
    expect((await rotate(next)).outcome).toBe('rotated');
    expect((await audit(user)).map((row) => row.action)).toEqual(['user.session.opened']);
  });

  it('au-delà de 10 s, le même rejeu révoque la famille', async () => {
    const user = await account();
    const session = await open(user);
    await rotate(session.tokenHash);
    await ageRotation(session.tokenHash);
    expect((await rotate(session.tokenHash)).outcome).toBe('reuse');
    expect(await valid(session.familyId)).toHaveLength(0);
  });

  it('un jeton plus ancien que le prédécesseur du jeton courant n’a jamais de grâce', async () => {
    const user = await account();
    const session = await open(user);
    const second = hash();
    await rotate(session.tokenHash, second);
    await rotate(second);
    // Deux rotations en moins de 10 s : seul le dernier jeton consommé bénéficie de la grâce.
    expect((await rotate(session.tokenHash)).outcome).toBe('reuse');
    expect(await valid(session.familyId)).toHaveLength(0);
  });

  it('famille déjà fermée pendant la grâce : invalid', async () => {
    const user = await account();
    const session = await open(user);
    const next = hash();
    await rotate(session.tokenHash, next);
    expect(await logoutSession(client, next)).toBe(user);
    expect(await rotate(session.tokenHash)).toEqual({ outcome: 'invalid' });
  });
});

describe('déconnexion (oz_auth_logout)', () => {
  it('révoque la famille du jeton courant et journalise', async () => {
    const user = await account();
    const session = await open(user);
    const other = await open(user);
    expect(await logoutSession(client, session.tokenHash)).toBe(user);
    expect(await valid(session.familyId)).toHaveLength(0);
    expect((await familyRows(session.familyId))[0]?.revoked_reason).toBe('logout');
    expect(await valid(other.familyId)).toHaveLength(1);
    expect(await logoutSession(client, session.tokenHash)).toBeNull();
  });

  it('ignore un jeton inconnu ; un jeton consommé ferme quand même sa famille', async () => {
    expect(await logoutSession(client, hash())).toBeNull();
    const user = await account();
    const session = await open(user);
    await rotate(session.tokenHash);
    expect(await logoutSession(client, session.tokenHash)).toBe(user);
    expect(await valid(session.familyId)).toHaveLength(0);
    expect(await logoutSession(client, session.tokenHash)).toBeNull();
  });
});

describe('réinitialisation du mot de passe (lot 1.3a)', () => {
  it('révoque toutes les sessions avec le motif password_reset', async () => {
    const address = `reset-session-${String(++counter)}@example.test`;
    const verify = hash();
    const user = await registerUser(client, {
      email: address,
      passwordHash: HASH,
      tokenHash: verify,
      ttlSeconds: DAY,
    });
    await verifyEmail(client, verify);
    const session = await open(user ?? '');
    const reset = hash();
    await requestPasswordReset(client, { email: address, tokenHash: reset, ttlSeconds: 1800 });
    expect(await resetPassword(client, { tokenHash: reset, passwordHash: HASH })).toBe(address);
    expect((await familyRows(session.familyId)).map((row) => row.revoked_reason)).toEqual([
      'password_reset',
    ]);
  });
});

describe('sous contexte utilisateur (RLS sessions_self, EX-103 n° 6)', () => {
  it('liste ses seules sessions valides, une par famille, IP tronquée, date d’ouverture', async () => {
    const user = await account();
    const intruder = await account();
    const first = await open(user, 'Firefox · macOS');
    const second = await open(user, 'Safari · iOS', '2001:db8::1');
    await rotate(first.tokenHash);
    const closed = await open(user);
    await logoutSession(client, closed.tokenHash);
    await open(intruder);

    const sessions = await withUserContext(client, user, (tx) => listSessions(tx));
    expect(sessions.map((s) => s.familyId).sort()).toEqual(
      [first.familyId, second.familyId].sort(),
    );
    const rotated = sessions.find((s) => s.familyId === first.familyId);
    expect(rotated?.ip).toBe('198.51.100.0/24');
    expect(rotated?.device).toBe('Firefox · macOS');
    const opened = (await familyRows(first.familyId))[0];
    expect(rotated?.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(opened).toBeDefined();
    expect(JSON.stringify(sessions)).not.toMatch(/[0-9a-f]{64}/);
  });

  it('révoque une de ses sessions, jamais celle d’un autre compte', async () => {
    const user = await account();
    const intruder = await account();
    const mine = await open(user);
    const theirs = await open(intruder);
    expect(await withUserContext(client, user, (tx) => revokeSession(tx, theirs.familyId))).toBe(
      false,
    );
    expect(await valid(theirs.familyId)).toHaveLength(1);
    // Identifiant stable : la famille reste révocable après une rotation.
    await rotate(mine.tokenHash);
    expect(await withUserContext(client, user, (tx) => revokeSession(tx, mine.familyId))).toBe(
      true,
    );
    expect(await valid(mine.familyId)).toHaveLength(0);
    const reasons = (await familyRows(mine.familyId)).map((row) => row.revoked_reason);
    expect(reasons).toContain('revoked_by_user');
    expect(await withUserContext(client, user, (tx) => revokeSession(tx, mine.familyId))).toBe(
      false,
    );
    expect((await audit(user)).map((row) => row.action)).toContain('user.session.revoked');
  });

  it('une session expirée n’est plus révocable (absente de la liste)', async () => {
    const user = await account();
    const session = await open(user);
    await age(
      `UPDATE sessions SET created_at = now() - interval '2 days',
        expires_at = now() - interval '1 second' WHERE family_id = $1`,
      [session.familyId],
    );
    expect(await withUserContext(client, user, (tx) => revokeSession(tx, session.familyId))).toBe(
      false,
    );
  });

  it('déconnexion globale : toutes ses familles, aucune autre', async () => {
    const user = await account();
    const intruder = await account();
    const a = await open(user);
    const b = await open(user);
    const theirs = await open(intruder);
    expect(await withUserContext(client, user, (tx) => revokeAllSessions(tx))).toBe(2);
    expect(await valid(a.familyId)).toHaveLength(0);
    expect(await valid(b.familyId)).toHaveLength(0);
    expect(await valid(theirs.familyId)).toHaveLength(1);
    expect((await audit(user)).map((row) => row.action)).toContain('user.session.logout_all');
    // Rien à révoquer : ni ligne, ni entrée d'audit.
    expect(await withUserContext(client, user, (tx) => revokeAllSessions(tx))).toBe(0);
    expect(
      (await audit(user)).filter((row) => row.action === 'user.session.logout_all'),
    ).toHaveLength(1);
  });

  it('le titulaire ne révoque qu’avec ses motifs, sans effacer ni réécrire la ligne', async () => {
    const user = await account();
    const session = await open(user);
    for (const change of [
      "revoked_at = now(), revoked_reason = 'rotated'",
      "revoked_at = now(), revoked_reason = 'reuse_detected'",
      'deleted_at = now()',
      "ip = '10.0.0.0/24'",
      "user_agent = 'autre'",
      'last_used_at = now()',
    ]) {
      await expect(
        withUserContext(client, user, (tx) =>
          tx.$executeRawUnsafe(
            `UPDATE sessions SET ${change} WHERE family_id = $1::uuid`,
            session.familyId,
          ),
        ),
      ).rejects.toThrow(/seule la révocation/);
    }
    expect(await valid(session.familyId)).toHaveLength(1);
  });

  it('un appareil vu dans une famille volée ne devient pas « connu »', async () => {
    const user = await account();
    const session = await open(user, 'Opera · Linux');
    await rotate(session.tokenHash);
    await ageRotation(session.tokenHash);
    await rotate(session.tokenHash);
    expect((await open(user, 'Opera · Linux')).knownDevice).toBe(false);
  });

  it('garde d’accès : famille valide et compte actif seulement (D2)', async () => {
    const user = await account();
    const session = await open(user);
    const access = () =>
      withUserContext(client, user, (tx) =>
        sessionAccess(tx, session.familyId).then(({ status }) => status),
      );
    expect(await access()).toBe('active');
    const next = hash();
    await rotate(session.tokenHash, next);
    expect(await access()).toBe('active');
    // Un autre compte ne voit pas la famille.
    const intruder = await account();
    expect(
      await withUserContext(client, intruder, (tx) => sessionAccess(tx, session.familyId)),
    ).toEqual({ status: 'invalid', roles: [] });
    await db.query(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, [user]);
    expect(await access()).toBe('email_unverified');
    await db.query(
      `UPDATE users SET email_verified_at = now(), status = 'suspended' WHERE id = $1`,
      [user],
    );
    expect(await access()).toBe('invalid');
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [user]);
    await logoutSession(client, next);
    expect(await access()).toBe('invalid');
  });

  it('le titulaire ne peut ni créer, ni ressusciter, ni réattribuer une session', async () => {
    const user = await account();
    const session = await open(user);
    await logoutSession(client, session.tokenHash);
    await expect(
      withUserContext(
        client,
        user,
        (tx) => tx.$executeRaw`UPDATE sessions SET revoked_at = NULL, revoked_reason = NULL
          WHERE family_id = ${session.familyId}::uuid`,
      ),
    ).rejects.toThrow(/seule la révocation/);
    const live = await open(user);
    await expect(
      withUserContext(
        client,
        user,
        (tx) => tx.$executeRaw`UPDATE sessions SET expires_at = now() + interval '1 year'
          WHERE family_id = ${live.familyId}::uuid`,
      ),
    ).rejects.toThrow(/seule la révocation/);
    const intruder = await account();
    await expect(
      withUserContext(
        client,
        user,
        (tx) => tx.$executeRaw`UPDATE sessions SET user_id = ${intruder}::uuid
          WHERE family_id = ${live.familyId}::uuid`,
      ),
    ).rejects.toThrow(/row-level security|seule la révocation/);
    await expect(
      withUserContext(
        client,
        user,
        (
          tx,
        ) => tx.$executeRaw`INSERT INTO sessions (user_id, family_id, refresh_token_hash, expires_at)
          VALUES (${user}::uuid, gen_random_uuid(), ${hash()}, now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withUserContext(
        client,
        user,
        (tx) => tx.$executeRaw`DELETE FROM sessions WHERE family_id = ${live.familyId}::uuid`,
      ),
    ).resolves.toBe(0);
  });
});

describe('droits (D-059)', () => {
  it('le rôle applicatif ne lit aucune session sans contexte', async () => {
    await open(await account());
    await app.as(null, async (c) => {
      expect((await c.query('SELECT * FROM sessions')).rows).toHaveLength(0);
    });
  });

  it('un rôle qui n’est pas oz_app n’exécute aucune fonction de session', async () => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_stranger_s') THEN
        CREATE ROLE oz_stranger_s LOGIN PASSWORD 'oz_stranger_s' NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    const url = new URL(db.url);
    url.username = 'oz_stranger_s';
    url.password = 'oz_stranger_s';
    const stranger = createDbClient(url.toString());
    try {
      await expect(
        rotateSession(stranger, {
          tokenHash: hash(),
          newTokenHash: hash(),
          ip: null,
          ttlSeconds: TTL,
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(logoutSession(stranger, hash())).rejects.toThrow(/permission denied/);
      await expect(
        openSession(stranger, {
          userId: '00000000-0000-4000-8000-000000000000',
          tokenHash: hash(),
          device: null,
          ip: null,
          ttlSeconds: TTL,
          familyTtlSeconds: FAMILY_TTL,
        }),
      ).rejects.toThrow(/permission denied/);
      // Le verrou de famille non plus : un tiers bloquerait la rotation d'une famille (déni de service).
      await expect(
        stranger.$queryRaw`SELECT oz_sessions_lock_family(gen_random_uuid())::text`,
      ).rejects.toThrow(/permission denied/);
    } finally {
      await stranger.$disconnect();
    }
  });

  it('les fonctions internes ne sont pas appelables directement', async () => {
    for (const sql of [
      "SELECT oz_auth_truncate_ip('1.2.3.4')",
      'SELECT oz_auth_can_hold_session(gen_random_uuid())',
      "SELECT oz_auth_check_session_ttl(interval '1 day', interval '1 day')",
    ]) {
      await app.as(null, async (c) => {
        await expect(c.query(sql)).rejects.toThrow(/permission denied/);
      });
    }
  });

  it('propriétaire sans superutilisateur : les fonctions passent la RLS forcée', async () => {
    const FUNCTIONS = [
      'oz_auth_open_session(uuid, text, text, inet, interval, interval)',
      'oz_auth_rotate_session(text, text, inet, interval)',
      'oz_auth_logout(text)',
      'oz_auth_truncate_ip(inet)',
      'oz_auth_check_session_ttl(interval, interval)',
      'oz_auth_can_hold_session(uuid)',
      'oz_sessions_guard()',
      'oz_sessions_lock_family(uuid)',
      'oz_auth_reset_password(text, text)',
      'oz_auth_consume_token(text, auth_token_purpose)',
    ];
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_owner_s') THEN
        CREATE ROLE oz_owner_s NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await db.query('GRANT USAGE ON SCHEMA public TO oz_owner_s');
    await db.query('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO oz_owner_s');
    for (const fn of FUNCTIONS) await db.query(`ALTER FUNCTION ${fn} OWNER TO oz_owner_s`);
    try {
      const user = await account();
      const session = await open(user);
      const next = hash();
      expect((await rotate(session.tokenHash, next)).outcome).toBe('rotated');
      await ageRotation(session.tokenHash);
      expect((await rotate(session.tokenHash)).outcome).toBe('reuse');
      const other = await open(user);
      expect(await logoutSession(client, other.tokenHash)).toBe(user);
      // La réinitialisation (lot 1.3a, remplacée ici) révoque encore sous ce propriétaire.
      const address =
        (await db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [user]))[0]
          ?.email ?? '';
      const third = await open(user);
      const reset = hash();
      await requestPasswordReset(client, { email: address, tokenHash: reset, ttlSeconds: 1800 });
      expect(await resetPassword(client, { tokenHash: reset, passwordHash: HASH })).toBe(address);
      expect(await valid(third.familyId)).toHaveLength(0);
    } finally {
      for (const fn of FUNCTIONS) await db.query(`ALTER FUNCTION ${fn} OWNER TO CURRENT_USER`);
    }
  });
});

describe('entrées refusées', () => {
  it('avant la base : empreinte, durée, IP, appareil, identifiant', async () => {
    const user = await account();
    const base = {
      userId: user,
      tokenHash: hash(),
      device: null,
      ip: null,
      ttlSeconds: TTL,
      familyTtlSeconds: FAMILY_TTL,
    };
    await expect(openSession(client, { ...base, tokenHash: 'abc' })).rejects.toThrow(/empreinte/);
    await expect(openSession(client, { ...base, userId: 'x' })).rejects.toThrow(/UUID/);
    await expect(openSession(client, { ...base, ip: '999.1.1.1' })).rejects.toThrow(/IP/);
    await expect(openSession(client, { ...base, device: 'x'.repeat(101) })).rejects.toThrow(
      /appareil/,
    );
    await expect(openSession(client, { ...base, device: '' })).rejects.toThrow(/appareil/);
    for (const [ttlSeconds, familyTtlSeconds] of [
      [DAY - 1, FAMILY_TTL],
      [31 * DAY, FAMILY_TTL],
      [TTL, TTL - 1],
      [TTL, 91 * DAY],
      [1.5, FAMILY_TTL],
    ]) {
      await expect(
        openSession(client, {
          ...base,
          ttlSeconds: ttlSeconds ?? 0,
          familyTtlSeconds: familyTtlSeconds ?? 0,
        }),
      ).rejects.toThrow(/durées/);
    }
    await expect(rotate('abc')).rejects.toThrow(/empreinte/);
    await expect(logoutSession(client, 'abc')).rejects.toThrow(/empreinte/);
    await expect(withUserContext(client, user, (tx) => revokeSession(tx, 'x'))).rejects.toThrow(
      /UUID/,
    );
    await expect(withUserContext(client, user, (tx) => sessionAccess(tx, 'x'))).rejects.toThrow(
      /UUID/,
    );
  });

  it('en base aussi : durées hors bornes, appareil trop long', async () => {
    const user = await account();
    await app.as(null, async (c) => {
      await expect(
        c.query(
          `SELECT * FROM oz_auth_open_session($1, $2, NULL, NULL, interval '31 days', interval '90 days')`,
          [user, hash()],
        ),
      ).rejects.toThrow(/durée de session/);
    });
    await app.as(null, async (c) => {
      await expect(
        c.query(
          `SELECT * FROM oz_auth_open_session($1, $2, repeat('x', 101), NULL, interval '30 days', interval '90 days')`,
          [user, hash()],
        ),
      ).rejects.toThrow(/sessions_user_agent_check/);
    });
  });
});
