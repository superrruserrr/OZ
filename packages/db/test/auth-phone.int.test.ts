import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, verifyEmail } from '../src/auth.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { setVerifiedPhone } from '../src/phone.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Téléphone du compte (lot 1.3cc) : fonction privilégiée sous le rôle applicatif, garde des colonnes.

const PASSWORD =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
const ENCRYPTION = 'k'.repeat(40);
const BLIND = 'b'.repeat(40);
const PHONE = '+237650000001';
const keys = { encryptionKey: ENCRYPTION, blindIndexKey: BLIND };

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let counter = 0;

const hash = (): string => createHash('sha256').update(randomBytes(32)).digest('hex');

async function account(): Promise<string> {
  const verify = hash();
  const id = await registerUser(client, {
    email: `phone-${String(++counter)}@example.test`,
    passwordHash: PASSWORD,
    tokenHash: verify,
    ttlSeconds: 86_400,
  });
  if (id === null) throw new Error('inscription refusée');
  expect(await verifyEmail(client, verify)).toBe(true);
  return id;
}

const row = async (id: string) =>
  (
    await db.query<{
      phone: string | null;
      plain: boolean;
      hmac: string | null;
      verified: Date | null;
    }>(
      `SELECT oz_decrypt(phone_encrypted, $2) AS phone,
              position(convert_to($3, 'UTF8') IN coalesce(phone_encrypted, ''::bytea)) > 0 AS plain,
              encode(phone_hmac, 'hex') AS hmac, phone_verified_at AS verified
       FROM users WHERE id = $1::uuid`,
      [id, ENCRYPTION, PHONE],
    )
  )[0];

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

describe('setVerifiedPhone', () => {
  it('écrit numéro chiffré, empreinte et date en une fois, sous oz_app', async () => {
    const id = await account();
    expect(await setVerifiedPhone(client, { userId: id, phone: PHONE, ...keys })).toBe('verified');
    const stored = await row(id);
    expect(stored?.phone).toBe(PHONE);
    expect(stored?.plain).toBe(false);
    expect(stored?.hmac).toMatch(/^[0-9a-f]+$/);
    expect(stored?.verified).not.toBeNull();
  });

  it('même numéro : « same » ; autre numéro : « changed », journalisé sans le numéro', async () => {
    const id = await account();
    await setVerifiedPhone(client, { userId: id, phone: PHONE, ...keys });
    expect(await setVerifiedPhone(client, { userId: id, phone: PHONE, ...keys })).toBe('same');
    const other = '+237650000002';
    expect(await setVerifiedPhone(client, { userId: id, phone: other, ...keys })).toBe('changed');
    expect((await row(id))?.phone).toBe(other);
    const audit = await db.query<{ action: string; reason: string }>(
      `SELECT action, reason FROM audit_log WHERE target_id = $1::uuid AND action LIKE 'user.phone.%' ORDER BY id`,
      [id],
    );
    expect(audit.map((entry) => entry.action)).toEqual([
      'user.phone.verified',
      'user.phone.changed',
    ]);
    expect(JSON.stringify(audit)).not.toContain('65000000');
  });

  it('un même numéro peut servir à deux comptes (D2) ; même empreinte', async () => {
    const [a, b] = [await account(), await account()];
    await setVerifiedPhone(client, { userId: a, phone: PHONE, ...keys });
    expect(await setVerifiedPhone(client, { userId: b, phone: PHONE, ...keys })).toBe('verified');
    expect((await row(a))?.hmac).toBe((await row(b))?.hmac);
  });

  it('compte suspendu ou inconnu : null, rien d’écrit', async () => {
    const id = await account();
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1::uuid`, [id]);
    expect(await setVerifiedPhone(client, { userId: id, phone: PHONE, ...keys })).toBeNull();
    expect((await row(id))?.phone).toBeNull();
    expect(
      await setVerifiedPhone(client, {
        userId: '01970000-0000-7000-8000-00000000dead',
        phone: PHONE,
        ...keys,
      }),
    ).toBeNull();
  });

  it('refuse un numéro ou un identifiant mal formé, côté client et côté base', async () => {
    const id = await account();
    await expect(setVerifiedPhone(client, { userId: id, phone: '650', ...keys })).rejects.toThrow(
      /E\.164/,
    );
    await expect(setVerifiedPhone(client, { userId: 'x', phone: PHONE, ...keys })).rejects.toThrow(
      /UUID/,
    );
    await expect(
      client.$queryRaw`SELECT oz_auth_set_verified_phone(${id}::uuid, ${'650'}, ${ENCRYPTION}, ${BLIND})`,
    ).rejects.toThrow();
  });
});

describe('retour arrière', () => {
  it('sous un propriétaire sans droit de contourner la RLS, la date disparaît avec le numéro', async () => {
    const id = await account();
    await setVerifiedPhone(client, { userId: id, phone: PHONE, ...keys });
    await db.query('CREATE ROLE oz_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS');
    const down = readFileSync(
      new URL('../prisma/migrations/20261102090000_auth_phone/down.sql', import.meta.url),
      'utf8',
    );
    const owner = new pg.Client({ connectionString: db.url });
    await owner.connect();
    try {
      // Comme oz_migrator en recette ; tout est annulé à la fin de la transaction.
      await owner.query('BEGIN');
      await owner.query('GRANT oz_owner_test TO CURRENT_USER');
      await owner.query('ALTER TABLE users OWNER TO oz_owner_test');
      await owner.query(
        'ALTER FUNCTION oz_auth_set_verified_phone(uuid, text, text, text) OWNER TO oz_owner_test',
      );
      await owner.query('ALTER FUNCTION oz_users_guard_phone() OWNER TO oz_owner_test');
      await owner.query('SET LOCAL ROLE oz_owner_test');
      await owner.query(down);
      await owner.query('RESET ROLE');
      const rows = await owner.query<{ verified: Date | null }>(
        'SELECT phone_verified_at AS verified FROM users WHERE id = $1::uuid',
        [id],
      );
      expect(rows.rows[0]?.verified).toBeNull();
    } finally {
      await owner.query('ROLLBACK');
      await owner.end();
    }
  });
});

describe('garde des colonnes', () => {
  it('sous contexte utilisateur, le titulaire ne change ni numéro ni date', async () => {
    const id = await account();
    for (const assignment of [
      `phone_encrypted = '\\x01', phone_hmac = '\\x01'`,
      'phone_verified_at = now()',
    ]) {
      await expect(
        withUserContext(client, id, (tx) =>
          tx.$executeRawUnsafe(`UPDATE users SET ${assignment} WHERE id = '${id}'::uuid`),
        ),
      ).rejects.toThrow();
    }
    expect((await row(id))?.verified).toBeNull();
  });

  it('un autre utilisateur ne lit pas la ligne ni le numéro', async () => {
    const [owner, other] = [await account(), await account()];
    await setVerifiedPhone(client, { userId: owner, phone: PHONE, ...keys });
    const seen = await withUserContext(client, other, (tx) =>
      tx.$queryRawUnsafe<unknown[]>(`SELECT phone_hmac FROM users WHERE id = '${owner}'::uuid`),
    );
    expect(seen).toEqual([]);
  });

  it('contraintes : ni moitié de numéro, ni date sans numéro', async () => {
    const id = await account();
    await expect(
      db.query(`UPDATE users SET phone_hmac = '\\x01' WHERE id = $1::uuid`, [id]),
    ).rejects.toThrow(/users_phone_pair_check/);
    await expect(
      db.query(`UPDATE users SET phone_verified_at = now() WHERE id = $1::uuid`, [id]),
    ).rejects.toThrow(/users_phone_verified_check/);
  });

  it('EXECUTE réservé à oz_app', async () => {
    const rows = await db.query<{ public: boolean; app: boolean }>(
      `SELECT has_function_privilege('public', p, 'EXECUTE') AS public,
              has_function_privilege('oz_app', p, 'EXECUTE') AS app
       FROM (SELECT 'oz_auth_set_verified_phone(uuid,text,text,text)'::regprocedure AS p) f`,
    );
    expect(rows[0]).toEqual({ public: false, app: true });
  });
});
