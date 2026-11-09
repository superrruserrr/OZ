import { generateTotpCode } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { MailDispatcher } from '../src/auth/mail/mail-dispatcher.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Suppression du compte (lot 1.16ca, tâche 3, EX-118 n° 3) : demande ré-authentifiée, sessions
// révoquées, suivi et annulation après reconnexion, emails, rien de secret au journal.

const PASSWORD = 'correct horse battery staple';
const WRONG = 'mauvais mot de passe synthétique';
const STEP_MS = 30_000;
const SCHEDULED = 'Suppression de votre compte OZ programmée';
const CANCELLED = 'Suppression de votre compte OZ annulée';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;

const login = async (email: string): Promise<string> => {
  const response = await request(server).post('/auth/login').send({ email, password: PASSWORD });
  return (response.body as { accessToken: string }).accessToken;
};

async function account(): Promise<{ email: string; accessToken: string }> {
  const email = `suppression-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(email, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  return { email, accessToken: await login(email) };
}

/** Compte à 2FA active, enrôlé un pas en arrière : le pas courant reste libre. */
async function enrolled(): Promise<{ email: string; accessToken: string; secret: string }> {
  const created = await account();
  const setup = await request(server)
    .post('/auth/2fa/setup')
    .set('Authorization', `Bearer ${created.accessToken}`)
    .expect(200);
  const { secret } = setup.body as { secret: string };
  await request(server)
    .post('/auth/2fa/enable')
    .set('Authorization', `Bearer ${created.accessToken}`)
    .send({ code: generateTotpCode(secret, Date.now() - STEP_MS) })
    .expect(200);
  return { ...created, secret };
}

const ask = (accessToken: string, body: object) =>
  request(server)
    .post('/account/deletion')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);
const follow = (accessToken: string) =>
  request(server).get('/account/deletion').set('Authorization', `Bearer ${accessToken}`);
const cancel = (accessToken: string) =>
  request(server).delete('/account/deletion').set('Authorization', `Bearer ${accessToken}`);

const requestsOf = async (email: string): Promise<string[]> =>
  (
    await harness.db.query<{ status: string }>(
      `SELECT r.status FROM account_deletion_requests r JOIN users u ON u.id = r.user_id
       WHERE u.email = $1 ORDER BY r.requested_at`,
      [email],
    )
  ).rows.map((row) => row.status);

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
});
afterAll(async () => {
  await harness.stop();
});
afterEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('/account/deletion', () => {
  it('sans session : 401 sur la demande, le suivi et l’annulation', async () => {
    await request(server).post('/account/deletion').send({ password: PASSWORD }).expect(401);
    await request(server).get('/account/deletion').expect(401);
    await request(server).delete('/account/deletion').expect(401);
  });

  it('202 à +30 jours, sessions révoquées, audit, email ; reconnexion : suivi puis annulation', async () => {
    const { email, accessToken } = await account();
    const none = await follow(accessToken).expect(200);
    expect(none.body).toEqual({ pending: null });
    expect(none.headers['cache-control']).toBe('no-store');

    const response = await ask(accessToken, { password: PASSWORD }).expect(202);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as { requestedAt: string; scheduledFor: string };
    expect(Date.parse(body.scheduledFor) - Date.parse(body.requestedAt)).toBe(30 * 86_400_000);
    expect(await requestsOf(email)).toEqual(['pending']);
    const sessions = await harness.db.query<{ reason: string | null }>(
      `SELECT s.revoked_reason AS reason FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.email = $1`,
      [email],
    );
    expect(sessions.rows.map((s) => s.reason)).toEqual(['account_deleted']);
    // Le jeton d'accès de la session révoquée ne sert plus.
    await follow(accessToken).expect(401);
    await harness.app.get(MailDispatcher).flush();
    expect(await harness.mailTo(email, SCHEDULED)).toContain('reconnecter pour annuler');

    const again = await login(email);
    const followed = await follow(again).expect(200);
    expect(followed.body).toEqual({ pending: body });
    const conflict = await ask(again, { password: PASSWORD }).expect(409);
    expect(errorOf(conflict).code).toBe('ACCOUNT_DELETION_PENDING');

    await cancel(again).expect(204);
    expect(await requestsOf(email)).toEqual(['cancelled']);
    expect((await follow(again).expect(200)).body).toEqual({ pending: null });
    const missing = await cancel(again).expect(404);
    expect(errorOf(missing).code).toBe('ACCOUNT_DELETION_NOT_FOUND');
    await harness.app.get(MailDispatcher).flush();
    expect(await harness.mailTo(email, CANCELLED)).toContain('annulée');

    const audit = await harness.db.query<{ action: string }>(
      `SELECT a.action FROM audit_log a JOIN users u ON u.id = a.actor_user_id
       WHERE u.email = $1 AND a.action LIKE 'account.deletion.%' ORDER BY a.chain_position`,
      [email],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'account.deletion.requested',
      'account.deletion.cancelled',
    ]);
  });

  it('mot de passe faux, code manquant ou faux : même 403, aucune demande, session intacte', async () => {
    const plain = await account();
    const wrong = await ask(plain.accessToken, { password: WRONG }).expect(403);
    expect(errorOf(wrong).code).toBe('ACCOUNT_DELETION_REJECTED');
    await follow(plain.accessToken).expect(200);

    const { email, accessToken, secret } = await enrolled();
    const missing = await ask(accessToken, { password: PASSWORD }).expect(403);
    const badCode = await ask(accessToken, { password: PASSWORD, code: '000000' }).expect(403);
    const badPassword = await ask(accessToken, {
      password: WRONG,
      code: generateTotpCode(secret, Date.now()),
    }).expect(403);
    for (const response of [missing, badCode, badPassword]) {
      expect(errorOf(response).code).toBe('ACCOUNT_DELETION_REJECTED');
      expect(errorOf(response).message).toBe(errorOf(wrong).message);
    }
    expect(await requestsOf(plain.email)).toEqual([]);
    expect(await requestsOf(email)).toEqual([]);
  });

  it('2FA active : mot de passe et code TOTP juste acceptés', async () => {
    const { email, accessToken, secret } = await enrolled();
    await ask(accessToken, {
      password: PASSWORD,
      code: generateTotpCode(secret, Date.now()),
    }).expect(202);
    expect(await requestsOf(email)).toEqual(['pending']);
  });

  it('corps invalide ou champ inconnu : 422', async () => {
    const { accessToken } = await account();
    await ask(accessToken, {}).expect(422);
    await ask(accessToken, {
      password: PASSWORD,
      userId: '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192',
    }).expect(422);
  });

  it('quota du compte : 429 avec `Retry-After`', async () => {
    const { accessToken } = await account();
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      account_deletion_account: { limit: 1, windowSeconds: 3600 },
    });
    await ask(accessToken, { password: WRONG }).expect(403);
    const limited = await ask(accessToken, { password: PASSWORD }).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('ni mot de passe ni code au journal', async () => {
    const { accessToken, secret } = await enrolled();
    const code = generateTotpCode(secret, Date.now());
    await ask(accessToken, { password: PASSWORD, code }).expect(202);
    const logs = JSON.stringify(harness.logs.lines());
    expect(logs).toContain('/account/deletion');
    expect(logs).not.toContain(PASSWORD);
    expect(logs).not.toContain(secret);
  });
});
