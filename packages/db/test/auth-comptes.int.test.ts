import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  credentialsFor,
  registerUser,
  rehashPassword,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../src/auth.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Comptes (lot 1.3a) : fonctions privilégiées appelées sous le rôle applicatif, sans contexte.

const HASH_A =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
const HASH_B =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI';
const DAY = 86_400;

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let counter = 0;

const token = (): { readonly value: string; readonly hash: string } => {
  const value = randomBytes(32).toString('base64url');
  return { value, hash: createHash('sha256').update(value).digest('hex') };
};
const email = (): string => `compte-${String(++counter)}@example.test`;

async function register(address = email()): Promise<{ id: string; verify: string }> {
  const verification = token();
  const id = await registerUser(client, {
    email: address,
    passwordHash: HASH_A,
    tokenHash: verification.hash,
    ttlSeconds: DAY,
  });
  if (id === null) throw new Error('inscription inattendue refusée');
  return { id, verify: verification.hash };
}

const userRow = async (id: string) =>
  (
    await db.query<{
      status: string;
      email_verified_at: Date | null;
      password_hash: string;
    }>('SELECT status, email_verified_at, password_hash FROM users WHERE id = $1', [id])
  )[0];

const audit = async (id: string) =>
  (
    await db.query<{ action: string; metadata: unknown }>(
      'SELECT action, metadata FROM audit_log WHERE target_id = $1 ORDER BY chain_position',
      [id],
    )
  ).map((row) => row.action);

beforeAll(async () => {
  db = await startDatabase();
  // Rôle applicatif des environnements hébergés (Terraform) : la migration lui accorde l'exécution.
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

describe('inscription (oz_auth_register)', () => {
  it('crée un compte en attente, son jeton et l’entrée d’audit, sans contexte', async () => {
    const { id } = await register('  Nouvelle.Personne@Example.TEST ');
    const row = await userRow(id);
    expect(row?.status).toBe('pending_verification');
    expect(row?.email_verified_at).toBeNull();
    const [stored] = await db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
      id,
    ]);
    expect(stored?.email).toBe('nouvelle.personne@example.test');
    expect(await audit(id)).toEqual(['user.account.registered']);
  });

  it('renvoie NULL pour un email déjà pris, sans rien créer ni journaliser', async () => {
    const address = email();
    await register(address);
    const before = await db.query('SELECT 1 FROM audit_log');
    const again = await registerUser(client, {
      email: address.toUpperCase(),
      passwordHash: HASH_B,
      tokenHash: token().hash,
      ttlSeconds: DAY,
    });
    expect(again).toBeNull();
    expect(await db.query('SELECT 1 FROM audit_log')).toHaveLength(before.length);
  });

  it('garde bloquée l’adresse d’un compte supprimé (rien n’est révélé ni réattribué)', async () => {
    const address = email();
    const { id } = await register(address);
    await db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);
    expect(
      await registerUser(client, {
        email: address,
        passwordHash: HASH_B,
        tokenHash: token().hash,
        ttlSeconds: DAY,
      }),
    ).toBeNull();
  });

  it('journalise sans email ni hash', async () => {
    const address = email();
    const { id } = await register(address);
    const rows = await db.query<{ reason: string; metadata: unknown }>(
      'SELECT reason, metadata FROM audit_log WHERE target_id = $1',
      [id],
    );
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(address);
    expect(serialized).not.toContain('argon2');
    expect(rows[0]?.metadata).toEqual({});
  });

  it('refuse un mot de passe qui n’est pas un hash Argon2id, et une empreinte ou une durée invalides', async () => {
    const base = { email: email(), passwordHash: HASH_A, tokenHash: token().hash, ttlSeconds: DAY };
    await expect(
      registerUser(client, { ...base, passwordHash: 'motdepasseenclair' }),
    ).rejects.toThrow(/Argon2id/);
    // La base revérifie, même appelée sans le wrapper.
    const call = (tokenHash: string, ttl: string) =>
      app.as(null, (c) =>
        c.query(`SELECT oz_auth_register($1, $2, $3, $4::interval)`, [
          base.email,
          HASH_A,
          tokenHash,
          ttl,
        ]),
      );
    await expect(call('abc', '1 day')).rejects.toThrow(/empreinte/);
    await expect(call(token().hash, '30 seconds')).rejects.toThrow(/durée/);
    await expect(call(token().hash, '8 days')).rejects.toThrow(/durée/);
  });
});

describe('accès direct refusé (D-059)', () => {
  it('le rôle applicatif ne lit ni les jetons ni les comptes sans passer par les fonctions', async () => {
    const { id } = await register();
    await app.as(null, async (c) => {
      expect((await c.query('SELECT * FROM auth_tokens')).rows).toHaveLength(0);
      expect((await c.query('SELECT * FROM users')).rows).toHaveLength(0);
    });
    // Même le titulaire, sous son propre contexte, ne voit pas ses jetons.
    await app.as(id, async (c) => {
      expect((await c.query('SELECT * FROM auth_tokens')).rows).toHaveLength(0);
      expect((await c.query('SELECT id FROM users')).rows).toEqual([{ id }]);
    });
  });

  it('le titulaire ne peut toujours pas se déclarer vérifié lui-même', async () => {
    const { id } = await register();
    await expect(
      withUserContext(
        client,
        id,
        (tx) => tx.$executeRaw`UPDATE users SET email_verified_at = now() WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/autorité/);
  });

  it('un rôle qui n’est pas oz_app n’exécute aucune fonction d’authentification', async () => {
    await db.query(
      `CREATE ROLE oz_stranger_test LOGIN PASSWORD 'oz_stranger_test' NOSUPERUSER NOBYPASSRLS`,
    );
    const url = new URL(db.url);
    url.username = 'oz_stranger_test';
    url.password = 'oz_stranger_test';
    const stranger = createDbClient(url.toString());
    try {
      await expect(credentialsFor(stranger, 'personne@example.test')).rejects.toThrow(
        /permission denied/,
      );
      await expect(verifyEmail(stranger, token().hash)).rejects.toThrow(/permission denied/);
    } finally {
      await stranger.$disconnect();
    }
  });

  it('les fonctions internes ne sont pas appelables directement', async () => {
    await app.as(null, async (c) => {
      await expect(
        c.query("SELECT oz_auth_consume_token($1, 'email_verification')", [token().hash]),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('confirmation d’email (oz_auth_verify_email)', () => {
  it('active le compte une seule fois et journalise', async () => {
    const { id, verify } = await register();
    expect(await verifyEmail(client, verify)).toBe(true);
    const row = await userRow(id);
    expect(row?.status).toBe('active');
    expect(row?.email_verified_at).toBeInstanceOf(Date);
    expect(await verifyEmail(client, verify)).toBe(false);
    expect(await audit(id)).toEqual(['user.account.registered', 'user.email.verified']);
  });

  it('refuse un jeton inconnu, expiré ou d’un autre usage', async () => {
    expect(await verifyEmail(client, token().hash)).toBe(false);
    const { verify } = await register();
    await db.query(
      `UPDATE auth_tokens SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
       WHERE token_hash = $1`,
      [verify],
    );
    expect(await verifyEmail(client, verify)).toBe(false);

    const address = email();
    await register(address);
    const reset = token();
    await requestPasswordReset(client, { email: address, tokenHash: reset.hash, ttlSeconds: 1800 });
    expect(await verifyEmail(client, reset.hash)).toBe(false);
  });

  it('ne laisse réussir qu’une confirmation sur deux concurrentes', async () => {
    const { verify } = await register();
    const results = await Promise.all([verifyEmail(client, verify), verifyEmail(client, verify)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('ne confirme pas un compte suspendu ou clos', async () => {
    for (const status of ['suspended', 'closed']) {
      const { id, verify } = await register();
      await db.query(`UPDATE users SET status = $2 WHERE id = $1`, [id, status]);
      expect(await verifyEmail(client, verify)).toBe(false);
      expect((await userRow(id))?.email_verified_at).toBeNull();
    }
  });

  it('ne confirme pas un compte supprimé', async () => {
    const { id, verify } = await register();
    await db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);
    expect(await verifyEmail(client, verify)).toBe(false);
    expect((await userRow(id))?.email_verified_at).toBeNull();
  });
});

describe('identifiants (oz_auth_credentials)', () => {
  it('renvoie le minimum pour vérifier un mot de passe', async () => {
    const address = email();
    const { id, verify } = await register(address);
    expect(await credentialsFor(client, ` ${address.toUpperCase()} `)).toEqual({
      userId: id,
      passwordHash: HASH_A,
      status: 'pending_verification',
      emailVerified: false,
    });
    await verifyEmail(client, verify);
    expect((await credentialsFor(client, address))?.emailVerified).toBe(true);
  });

  it('ne renvoie rien pour un compte inconnu ou supprimé', async () => {
    expect(await credentialsFor(client, 'personne@example.test')).toBeNull();
    const address = email();
    const { id } = await register(address);
    await db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);
    expect(await credentialsFor(client, address)).toBeNull();
  });
});

describe('réinitialisation du mot de passe', () => {
  it('ne crée rien pour un email inconnu, suspendu ou supprimé', async () => {
    expect(
      await requestPasswordReset(client, {
        email: 'inconnu@example.test',
        tokenHash: token().hash,
        ttlSeconds: 1800,
      }),
    ).toBeNull();
    const address = email();
    const { id } = await register(address);
    await db.query("UPDATE users SET status = 'suspended' WHERE id = $1", [id]);
    expect(
      await requestPasswordReset(client, {
        email: address,
        tokenHash: token().hash,
        ttlSeconds: 1800,
      }),
    ).toBeNull();
  });

  it('remplace le hash, vérifie l’email, révoque les sessions, et une seule fois', async () => {
    const address = email();
    const { id } = await register(address);
    await db.query(
      `INSERT INTO sessions (user_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, oz_uuid_v7(), repeat('a', 64), now() + interval '1 day'),
              ($1, oz_uuid_v7(), repeat('b', 64), now() + interval '1 day')`,
      [id],
    );
    const reset = token();
    expect(
      await requestPasswordReset(client, {
        email: address,
        tokenHash: reset.hash,
        ttlSeconds: 1800,
      }),
    ).toBe(id);
    expect(await resetPassword(client, { tokenHash: reset.hash, passwordHash: HASH_B })).toBe(
      address,
    );
    const row = await userRow(id);
    expect(row?.password_hash).toBe(HASH_B);
    expect(row?.status).toBe('active');
    expect(row?.email_verified_at).toBeInstanceOf(Date);
    const open = await db.query(
      'SELECT 1 FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [id],
    );
    expect(open).toHaveLength(0);
    expect(await resetPassword(client, { tokenHash: reset.hash, passwordHash: HASH_A })).toBeNull();
    expect(await audit(id)).toEqual([
      'user.account.registered',
      'user.password.reset_requested',
      'user.password.reset',
    ]);
  });

  it('ne laisse réussir qu’une réinitialisation sur deux concurrentes', async () => {
    const address = email();
    await register(address);
    const reset = token();
    await requestPasswordReset(client, { email: address, tokenHash: reset.hash, ttlSeconds: 1800 });
    const results = await Promise.all([
      resetPassword(client, { tokenHash: reset.hash, passwordHash: HASH_A }),
      resetPassword(client, { tokenHash: reset.hash, passwordHash: HASH_B }),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it('une nouvelle demande invalide la précédente', async () => {
    const address = email();
    await register(address);
    const first = token();
    const second = token();
    await requestPasswordReset(client, { email: address, tokenHash: first.hash, ttlSeconds: 1800 });
    await requestPasswordReset(client, {
      email: address,
      tokenHash: second.hash,
      ttlSeconds: 1800,
    });
    expect(await resetPassword(client, { tokenHash: first.hash, passwordHash: HASH_B })).toBeNull();
    expect(await resetPassword(client, { tokenHash: second.hash, passwordHash: HASH_B })).toBe(
      address,
    );
  });

  it('refuse un compte suspendu depuis la demande, et un hash invalide', async () => {
    const address = email();
    const { id } = await register(address);
    const reset = token();
    await requestPasswordReset(client, { email: address, tokenHash: reset.hash, ttlSeconds: 1800 });
    await expect(
      resetPassword(client, { tokenHash: reset.hash, passwordHash: 'clair' }),
    ).rejects.toThrow(/Argon2id/);
    await db.query("UPDATE users SET status = 'suspended' WHERE id = $1", [id]);
    expect(await resetPassword(client, { tokenHash: reset.hash, passwordHash: HASH_B })).toBeNull();
    expect((await userRow(id))?.password_hash).toBe(HASH_A);
  });
});

describe('mise à niveau du hash (oz_auth_rehash_password)', () => {
  const rehash = (as: string | null, input: Parameters<typeof rehashPassword>[1]) =>
    as === null
      ? rehashPassword(client, input)
      : withUserContext(client, as, (tx) => rehashPassword(tx, input));

  it('réservée au titulaire sous son propre contexte', async () => {
    const { id } = await register();
    const { id: other } = await register();
    const input = { userId: id, oldHash: HASH_A, newHash: HASH_B };
    await expect(rehash(null, input)).rejects.toThrow(/titulaire/);
    await expect(rehash(other, input)).rejects.toThrow(/titulaire/);
    expect((await userRow(id))?.password_hash).toBe(HASH_A);
  });

  it('ne remplace que si l’ancien hash est toujours en place, et journalise', async () => {
    const { id } = await register();
    expect(await rehash(id, { userId: id, oldHash: HASH_B, newHash: HASH_B })).toBe(false);
    expect(await rehash(id, { userId: id, oldHash: HASH_A, newHash: HASH_B })).toBe(true);
    expect((await userRow(id))?.password_hash).toBe(HASH_B);
    expect(await audit(id)).toEqual(['user.account.registered', 'user.password.rehashed']);
    await expect(rehash(id, { userId: id, oldHash: HASH_B, newHash: 'clair' })).rejects.toThrow(
      /Argon2id/,
    );
  });

  it('ne touche pas un compte suspendu', async () => {
    const { id } = await register();
    await db.query("UPDATE users SET status = 'suspended' WHERE id = $1", [id]);
    expect(await rehash(id, { userId: id, oldHash: HASH_A, newHash: HASH_B })).toBe(false);
  });
});

describe('propriétaire sans privilège de superutilisateur (recette, production)', () => {
  const FUNCTIONS = [
    'oz_auth_register(text, text, text, interval)',
    'oz_auth_credentials(text)',
    'oz_auth_consume_token(text, auth_token_purpose)',
    'oz_auth_mark_email_verified(uuid)',
    'oz_auth_verify_email(text)',
    'oz_auth_request_password_reset(text, text, interval)',
    'oz_auth_reset_password(text, text)',
    'oz_sessions_lock_family(uuid)',
  ];

  it('les fonctions passent la RLS forcée par leurs seules politiques privilégiées', async () => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_owner_test') THEN
        CREATE ROLE oz_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await db.query('GRANT USAGE ON SCHEMA public TO oz_owner_test');
    await db.query('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO oz_owner_test');
    for (const fn of FUNCTIONS) await db.query(`ALTER FUNCTION ${fn} OWNER TO oz_owner_test`);
    try {
      const address = email();
      const { id, verify } = await register(address);
      expect((await credentialsFor(client, address))?.userId).toBe(id);
      expect(await verifyEmail(client, verify)).toBe(true);
      const reset = token();
      expect(
        await requestPasswordReset(client, {
          email: address,
          tokenHash: reset.hash,
          ttlSeconds: 1800,
        }),
      ).toBe(id);
      expect(await resetPassword(client, { tokenHash: reset.hash, passwordHash: HASH_B })).toBe(
        address,
      );
      expect(await audit(id)).toEqual([
        'user.account.registered',
        'user.email.verified',
        'user.password.reset_requested',
        'user.password.reset',
      ]);
    } finally {
      for (const fn of FUNCTIONS) await db.query(`ALTER FUNCTION ${fn} OWNER TO CURRENT_USER`);
    }
  });
});

describe('entrées refusées avant la base', () => {
  it('refuse un identifiant ou une empreinte mal formés', async () => {
    await expect(verifyEmail(client, 'pas-une-empreinte')).rejects.toThrow(/empreinte/);
    await expect(
      rehashPassword(client, { userId: 'pas-un-uuid', oldHash: HASH_A, newHash: HASH_B }),
    ).rejects.toThrow(/UUID/);
    const base = { email: email(), passwordHash: HASH_A, tokenHash: token().hash, ttlSeconds: DAY };
    await expect(registerUser(client, { ...base, tokenHash: 'abc' })).rejects.toThrow(/empreinte/);
    await expect(registerUser(client, { ...base, ttlSeconds: Number.NaN })).rejects.toThrow(
      /durée/,
    );
    await expect(
      requestPasswordReset(client, { email: base.email, tokenHash: token().hash, ttlSeconds: 30 }),
    ).rejects.toThrow(/durée/);
  });
});
