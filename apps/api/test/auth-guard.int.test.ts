import { AccessTokens } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { formToken, startAuthHarness, tokenIn, type AuthHarness } from './auth-harness.js';

// Garde d'accès et sessions de l'utilisateur (lot 1.3b, EX-103 n° 1, 6, 9 ; D2).

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:3000';
const COOKIE = '__Host-oz_refresh';
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;

interface Session {
  readonly address: string;
  readonly accessToken: string;
  readonly cookie: string;
}

/** Compte actif et vérifié, connecté depuis `userAgent`. */
async function account(): Promise<string> {
  const address = `guard-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  return address;
}

async function login(address: string, userAgent = FIREFOX): Promise<Session> {
  const response = await request(server)
    .post('/auth/login')
    .set('User-Agent', userAgent)
    .send({ email: address, password: PASSWORD })
    .expect(200);
  const header = response.headers['set-cookie'] as unknown as string[];
  const cookie = new RegExp(`^${COOKIE}=([^;]*)`).exec(header[0] ?? '')?.[1] ?? '';
  return { address, accessToken: (response.body as { accessToken: string }).accessToken, cookie };
}

const bearer = (token: string) => `Bearer ${token}`;
const list = (token: string) =>
  request(server).get('/auth/sessions').set('Authorization', bearer(token));

interface Listed {
  readonly id: string;
  readonly device: string | null;
  readonly ip: string | null;
  readonly current: boolean;
}
const sessionsOf = async (token: string): Promise<Listed[]> =>
  ((await list(token).expect(200)).body as { sessions: Listed[] }).sessions;

const ROUTES = [
  { method: 'get', path: '/auth/sessions' },
  { method: 'delete', path: '/auth/sessions/00000000-0000-4000-8000-000000000001' },
  { method: 'post', path: '/auth/logout-all' },
] as const;

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
});
afterAll(async () => {
  await harness.stop();
});

describe('garde d’accès', () => {
  it('sans session valide, chaque route renvoie 401 au corps identique (rôle non autorisé)', async () => {
    const session = await login(await account());
    const foreign = new AccessTokens(new Uint8Array(64).fill(9));
    const forged = (
      await foreign.issue(
        { userId: crypto.randomUUID(), familyId: crypto.randomUUID() },
        new Date(),
      )
    ).token;
    const local = new AccessTokens(new Uint8Array(64).fill(1));
    const expired = (
      await local.issue(
        { userId: crypto.randomUUID(), familyId: crypto.randomUUID() },
        new Date(Date.now() - 3_600_000),
      )
    ).token;
    const bodies = new Set<string>();
    for (const route of ROUTES) {
      for (const authorization of [
        null,
        'Basic abc',
        bearer('pas.un.jeton'),
        bearer(forged),
        bearer(expired),
        session.accessToken, // sans le schéma Bearer
      ]) {
        const call = request(server)[route.method](route.path);
        if (authorization !== null) call.set('Authorization', authorization);
        const response = await call.expect(401);
        expect(errorOf(response).code).toBe('AUTH_UNAUTHENTICATED');
        bodies.add(
          JSON.stringify({ code: errorOf(response).code, message: errorOf(response).message }),
        );
      }
    }
    expect(bodies.size).toBe(1);
  });

  it('révocation effective dès la requête suivante (D2)', async () => {
    const session = await login(await account());
    await list(session.accessToken).expect(200);
    await request(server)
      .post('/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `${COOKIE}=${session.cookie}`)
      .expect(204);
    expect(errorOf(await list(session.accessToken).expect(401)).code).toBe('AUTH_UNAUTHENTICATED');
  });

  it('compte suspendu après émission : 401 ; email redevenu non vérifié : 403', async () => {
    const session = await login(await account());
    await harness.db.query(`UPDATE users SET status = 'suspended' WHERE email = $1`, [
      session.address,
    ]);
    await list(session.accessToken).expect(401);
    await harness.db.query(
      `UPDATE users SET status = 'active', email_verified_at = NULL WHERE email = $1`,
      [session.address],
    );
    expect(errorOf(await list(session.accessToken).expect(403)).code).toBe('AUTH_EMAIL_UNVERIFIED');
  });
});

describe('après rafraîchissement', () => {
  it('le nouveau jeton d’accès garde la même session (famille stable)', async () => {
    const session = await login(await account());
    const before = (await sessionsOf(session.accessToken))[0]?.id;
    const refreshed = await request(server)
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `${COOKIE}=${session.cookie}`)
      .expect(200);
    const token = (refreshed.body as { accessToken: string }).accessToken;
    const after = await sessionsOf(token);
    expect(after.map((s) => [s.id, s.current])).toEqual([[before, true]]);
    // L'ancien jeton d'accès reste valable jusqu'à son expiration : même famille, toujours active.
    await list(session.accessToken).expect(200);
  });
});

describe('GET /auth/sessions', () => {
  it('ses seules sessions actives, IP tronquée, appareil, session courante (EX-103 n° 6)', async () => {
    const address = await account();
    const desktop = await login(address, FIREFOX);
    const phone = await login(address, SAFARI);
    const closed = await login(address);
    await request(server)
      .post('/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `${COOKIE}=${closed.cookie}`)
      .expect(204);
    await login(await account()); // autre compte

    const response = await list(phone.accessToken).expect(200);
    const sessions = (response.body as { sessions: Listed[] }).sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current).map((s) => s.device)).toEqual(['Safari · iOS']);
    expect(sessions.map((s) => s.device).sort()).toEqual(['Firefox · macOS', 'Safari · iOS']);
    expect(sessions.every((s) => s.ip === '127.0.0.0/24')).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/[0-9a-f]{64}|Mozilla/);
    expect((await sessionsOf(desktop.accessToken)).find((s) => s.current)?.device).toBe(
      'Firefox · macOS',
    );
    // Session jamais utilisée depuis (colonne héritée du socle, nullable) : `lastUsedAt` nul.
    await harness.db.query(
      `UPDATE sessions s SET last_used_at = NULL FROM users u
       WHERE u.id = s.user_id AND u.email = $1`,
      [address],
    );
    const unused = await sessionsOf(desktop.accessToken);
    expect(unused.map((s) => (s as Listed & { lastUsedAt: string | null }).lastUsedAt)).toEqual([
      null,
      null,
    ]);
  });
});

describe('DELETE /auth/sessions/:id', () => {
  it('révoque une de ses sessions ; celle d’un autre compte → 404, rien n’est révoqué', async () => {
    const address = await account();
    const desktop = await login(address, FIREFOX);
    const phone = await login(address, SAFARI);
    const other = await login(await account());
    const otherId = (await sessionsOf(other.accessToken))[0]?.id ?? '';

    const refused = await request(server)
      .delete(`/auth/sessions/${otherId}`)
      .set('Authorization', bearer(desktop.accessToken))
      .expect(404);
    expect(errorOf(refused).code).toBe('AUTH_SESSION_NOT_FOUND');
    await list(other.accessToken).expect(200);

    const phoneId = (await sessionsOf(phone.accessToken)).find((s) => s.current)?.id ?? '';
    await request(server)
      .delete(`/auth/sessions/${phoneId}`)
      .set('Authorization', bearer(desktop.accessToken))
      .expect(204);
    await list(phone.accessToken).expect(401);
    expect(await sessionsOf(desktop.accessToken)).toHaveLength(1);
  });

  it('identifiant mal formé : 422', async () => {
    const session = await login(await account());
    await request(server)
      .delete('/auth/sessions/1')
      .set('Authorization', bearer(session.accessToken))
      .expect(422);
  });

  it('révoquer sa session courante efface le cookie, quelle que soit la casse de l’id', async () => {
    const session = await login(await account());
    const id = (await sessionsOf(session.accessToken))[0]?.id ?? '';
    const response = await request(server)
      .delete(`/auth/sessions/${id.toUpperCase()}`)
      .set('Authorization', bearer(session.accessToken))
      .expect(204);
    expect(String(response.headers['set-cookie'])).toMatch(new RegExp(`^${COOKIE}=;`));
  });
});

describe('POST /auth/logout-all', () => {
  it('révoque toutes ses familles, efface le cookie, audit user.session.logout_all (EX-103 n° 1)', async () => {
    const address = await account();
    const desktop = await login(address, FIREFOX);
    const phone = await login(address, SAFARI);
    const other = await login(await account());

    const response = await request(server)
      .post('/auth/logout-all')
      .set('Authorization', bearer(desktop.accessToken))
      .expect(204);
    expect(String(response.headers['set-cookie'])).toMatch(new RegExp(`^${COOKIE}=;`));
    await list(desktop.accessToken).expect(401);
    await list(phone.accessToken).expect(401);
    await list(other.accessToken).expect(200);
    const { rows } = await harness.db.query<{ action: string }>(
      `SELECT a.action FROM audit_log a JOIN users u ON u.id = a.actor_user_id WHERE u.email = $1`,
      [address],
    );
    expect(rows.map((row) => row.action)).toContain('user.session.logout_all');
  });
});
