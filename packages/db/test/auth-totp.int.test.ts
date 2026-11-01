import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, verifyEmail } from '../src/auth.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { withUserContext } from '../src/session-context.js';
import { openSession } from '../src/sessions.js';
import {
  beginTotp,
  consumeRecoveryCode,
  consumeTotpStep,
  disableTotp,
  enableTotp,
  replaceRecoveryCodes,
  totpState,
} from '../src/totp.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// 2FA TOTP (lot 1.3cb) : fonctions privilégiées sous le rôle applicatif, garde des colonnes.

const PASSWORD =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
const KEY = 'k'.repeat(40);
const SECRET = 'A'.repeat(32);
const OTHER_SECRET = 'B'.repeat(32);
const DAY = 86_400;

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let counter = 0;

const hash = (): string => createHash('sha256').update(randomBytes(32)).digest('hex');
const batch = (): string[] => Array.from({ length: 10 }, hash);

async function account(): Promise<string> {
  const verify = hash();
  const id = await registerUser(client, {
    email: `totp-${String(++counter)}@example.test`,
    passwordHash: PASSWORD,
    tokenHash: verify,
    ttlSeconds: DAY,
  });
  if (id === null) throw new Error('inscription refusée');
  expect(await verifyEmail(client, verify)).toBe(true);
  return id;
}

async function enrolled(hashes = batch()): Promise<string> {
  const userId = await account();
  await beginTotp(client, { userId, secret: SECRET, key: KEY });
  const ok = await enableTotp(client, {
    userId,
    secret: SECRET,
    step: 1000,
    recoveryHashes: hashes,
    key: KEY,
    keepFamilyId: null,
  });
  expect(ok).toBe(true);
  return userId;
}

async function session(userId: string) {
  const opened = await openSession(client, {
    userId,
    tokenHash: hash(),
    device: 'Firefox · macOS',
    ip: '203.0.113.1',
    ttlSeconds: 30 * DAY,
    familyTtlSeconds: 90 * DAY,
  });
  if (opened === null) throw new Error('session refusée');
  return opened;
}

const grantRole = (userId: string) =>
  db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [userId]);

const auditCount = async (userId: string, action: string) =>
  (
    await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM audit_log WHERE target_id = $1 AND action = $2',
      [userId, action],
    )
  )[0]?.n;

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

describe('enrôlement', () => {
  it('le secret n’est actif qu’après activation, et illisible en base', async () => {
    const userId = await account();
    expect(await beginTotp(client, { userId, secret: SECRET, key: KEY })).toBe(true);
    expect(await totpState(client, userId, KEY)).toMatchObject({
      secret: null,
      pendingSecret: SECRET,
      lastStep: null,
      required: false,
    });
    const raw = await db.query<{ s: Buffer }>(
      'SELECT totp_pending_secret_encrypted AS s FROM users WHERE id = $1',
      [userId],
    );
    expect(raw[0]?.s.toString('latin1')).not.toContain(SECRET);

    await enableTotp(client, {
      userId,
      secret: SECRET,
      step: 42,
      recoveryHashes: batch(),
      key: KEY,
      keepFamilyId: null,
    });
    expect(await totpState(client, userId, KEY)).toMatchObject({
      secret: SECRET,
      pendingSecret: null,
      lastStep: 42,
    });
    expect(await auditCount(userId, 'user.totp.enabled')).toBe(1);
  });

  it('un nouvel enrôlement remplace l’attente, jamais le secret actif', async () => {
    const userId = await enrolled();
    await beginTotp(client, { userId, secret: OTHER_SECRET, key: KEY });
    expect(await totpState(client, userId, KEY)).toMatchObject({
      secret: SECRET,
      pendingSecret: OTHER_SECRET,
    });
  });

  it('activation d’un secret qui n’est plus celui en attente : refusée', async () => {
    const userId = await account();
    await beginTotp(client, { userId, secret: OTHER_SECRET, key: KEY });
    const ok = await enableTotp(client, {
      userId,
      secret: SECRET,
      step: 1,
      recoveryHashes: batch(),
      key: KEY,
      keepFamilyId: null,
    });
    expect(ok).toBe(false);
    expect((await totpState(client, userId, KEY))?.secret).toBeNull();
  });

  it('activation : révoque les autres sessions, garde la famille courante', async () => {
    const userId = await account();
    const kept = await session(userId);
    const other = await session(userId);
    await beginTotp(client, { userId, secret: SECRET, key: KEY });
    await enableTotp(client, {
      userId,
      secret: SECRET,
      step: 1,
      recoveryHashes: batch(),
      key: KEY,
      keepFamilyId: kept.familyId,
    });
    const rows = await db.query<{ family_id: string; revoked_reason: string | null }>(
      'SELECT family_id, revoked_reason FROM sessions WHERE user_id = $1',
      [userId],
    );
    const reason = (family: string) => rows.find((r) => r.family_id === family)?.revoked_reason;
    expect(reason(kept.familyId)).toBeNull();
    expect(reason(other.familyId)).toBe('two_factor_changed');
  });

  it('changement d’appareil : journalisé comme tel, nouveau pas', async () => {
    const userId = await enrolled();
    await beginTotp(client, { userId, secret: OTHER_SECRET, key: KEY });
    await enableTotp(client, {
      userId,
      secret: OTHER_SECRET,
      step: 5,
      recoveryHashes: batch(),
      key: KEY,
      keepFamilyId: null,
    });
    expect(await totpState(client, userId, KEY)).toMatchObject({
      secret: OTHER_SECRET,
      lastStep: 5,
    });
    expect(await auditCount(userId, 'user.totp.changed')).toBe(1);
  });

  it('compte suspendu : aucun état, aucun enrôlement', async () => {
    const userId = await account();
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [userId]);
    expect(await totpState(client, userId, KEY)).toBeNull();
    expect(await beginTotp(client, { userId, secret: SECRET, key: KEY })).toBe(false);
  });

  it('mauvaise clé : erreur, jamais un faux secret', async () => {
    const userId = await enrolled();
    await expect(totpState(client, userId, 'z'.repeat(40))).rejects.toThrow();
  });
});

describe('anti-rejeu (D2)', () => {
  it('un pas ne se consomme qu’une fois, jamais à rebours', async () => {
    const userId = await enrolled();
    expect(await consumeTotpStep(client, userId, 1001)).toBe(true);
    expect(await consumeTotpStep(client, userId, 1001)).toBe(false);
    expect(await consumeTotpStep(client, userId, 1000)).toBe(false);
    expect(await consumeTotpStep(client, userId, 1002)).toBe(true);
  });

  it('deux vérifications simultanées du même code : une seule acceptée', async () => {
    const userId = await enrolled();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeTotpStep(client, userId, 2000)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('sans 2FA active : refus', async () => {
    expect(await consumeTotpStep(client, await account(), 1)).toBe(false);
  });
});

describe('codes de secours (D5)', () => {
  it('usage unique, compte les restants, journalisé', async () => {
    const hashes = batch();
    const userId = await enrolled(hashes);
    expect(await consumeRecoveryCode(client, userId, hashes[0] as string)).toBe(9);
    expect(await consumeRecoveryCode(client, userId, hashes[0] as string)).toBeNull();
    expect(await consumeRecoveryCode(client, userId, hash())).toBeNull();
    expect(await auditCount(userId, 'user.totp.recovery_used')).toBe(1);
  });

  it('le code d’un autre compte ne vaut pas ici', async () => {
    const hashes = batch();
    await enrolled(hashes);
    expect(await consumeRecoveryCode(client, await enrolled(), hashes[1] as string)).toBeNull();
  });

  it('régénération : l’ancien lot cesse de valoir', async () => {
    const before = batch();
    const after = batch();
    const userId = await enrolled(before);
    expect(await replaceRecoveryCodes(client, userId, after)).toBe(true);
    expect(await consumeRecoveryCode(client, userId, before[0] as string)).toBeNull();
    expect(await consumeRecoveryCode(client, userId, after[0] as string)).toBe(9);
  });

  it('régénération sans 2FA active : refus', async () => {
    expect(await replaceRecoveryCodes(client, await account(), batch())).toBe(false);
  });

  it('lot incomplet ou en double : refusé par la base', async () => {
    const userId = await enrolled();
    const same = hash();
    await expect(
      client.$queryRaw`SELECT oz_auth_totp_replace_recovery(
        ${userId}::uuid, ${Array.from({ length: 10 }, () => same)}::text[])`,
    ).rejects.toThrow(/mal formé/);
    await expect(replaceRecoveryCodes(client, userId, [same])).rejects.toThrow(/dix/);
  });
});

describe('désactivation (D6, D7)', () => {
  it('efface secret et codes, révoque les autres sessions', async () => {
    const hashes = batch();
    const userId = await enrolled(hashes);
    const kept = await session(userId);
    const other = await session(userId);
    expect(await disableTotp(client, { userId, keepFamilyId: kept.familyId })).toBe('disabled');
    expect(await totpState(client, userId, KEY)).toMatchObject({ secret: null, lastStep: null });
    expect(await consumeRecoveryCode(client, userId, hashes[0] as string)).toBeNull();
    const revoked = await db.query<{ revoked_reason: string }>(
      'SELECT revoked_reason FROM sessions WHERE family_id = $1',
      [other.familyId],
    );
    expect(revoked[0]?.revoked_reason).toBe('two_factor_changed');
    expect(await auditCount(userId, 'user.totp.disabled')).toBe(1);
  });

  it('interdite si un rôle impose la 2FA', async () => {
    const userId = await enrolled();
    await grantRole(userId);
    expect((await totpState(client, userId, KEY))?.required).toBe(true);
    expect(await disableTotp(client, { userId, keepFamilyId: null })).toBe('required');
    expect((await totpState(client, userId, KEY))?.secret).toBe(SECRET);
  });

  it('rien d’actif : « inactive »', async () => {
    expect(await disableTotp(client, { userId: await account(), keepFamilyId: null })).toBe(
      'inactive',
    );
  });
});

describe('garde et droits', () => {
  it.each([
    ['totp_enabled_at', 'NULL'],
    ['totp_secret_encrypted', 'NULL'],
    ['totp_last_step', '0'],
    ['totp_pending_secret_encrypted', `'\\x00'`],
  ])('le titulaire ne modifie pas %s, sous RLS', async (column, value) => {
    const userId = await enrolled();
    await expect(
      withUserContext(client, userId, (tx) =>
        tx.$executeRawUnsafe(`UPDATE users SET ${column} = ${value} WHERE id = '${userId}'`),
      ),
    ).rejects.toThrow(/TOTP non modifiable/);
  });

  it('codes de secours : aucun accès direct, même au titulaire', async () => {
    const userId = await enrolled();
    const seen = await withUserContext(
      client,
      userId,
      (tx) => tx.$queryRaw<unknown[]>`SELECT * FROM auth_recovery_codes`,
    );
    expect(seen).toEqual([]);
  });

  it('colonnes cohérentes : 2FA active sans secret refusée', async () => {
    await expect(
      db.query(`UPDATE users SET totp_enabled_at = now() WHERE id = $1`, [await account()]),
    ).rejects.toThrow(/users_totp_enabled_check/);
  });

  it('propriétaire non superutilisateur : les rôles obligatoires restent lus, sans contexte (D6)', async () => {
    const functions = [
      'oz_auth_totp_required(uuid)',
      'oz_auth_totp_state(uuid, text)',
      'oz_auth_totp_disable(uuid, uuid)',
      'oz_auth_totp_revoke_others(uuid, uuid)',
      'oz_auth_can_hold_session(uuid)',
      'oz_sessions_lock_family(uuid)',
    ];
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_owner_test') THEN
        CREATE ROLE oz_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await db.query('GRANT USAGE ON SCHEMA public TO oz_owner_test');
    await db.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oz_owner_test',
    );
    await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO oz_owner_test');
    for (const fn of functions) await db.query(`ALTER FUNCTION ${fn} OWNER TO oz_owner_test`);
    try {
      const userId = await enrolled();
      await grantRole(userId);
      expect((await totpState(client, userId, KEY))?.required).toBe(true);
      expect(await disableTotp(client, { userId, keepFamilyId: null })).toBe('required');
    } finally {
      for (const fn of functions) await db.query(`ALTER FUNCTION ${fn} OWNER TO CURRENT_USER`);
    }
  });

  it('fonctions internes fermées au rôle applicatif', async () => {
    await expect(
      client.$queryRaw`SELECT oz_auth_totp_revoke_others(${await account()}::uuid, NULL)`,
    ).rejects.toThrow(/permission denied/);
  });
});
