import { generateTotpCode } from '@oz/auth';
import { Queue } from 'bullmq';
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

// Export des données (lot 1.16ba, tâche 4, EX-118 n° 2) : demande ré-authentifiée, une à la fois,
// suivi sans cache, alerte au titulaire, rien de secret au journal.

const PASSWORD = 'correct horse battery staple';
const WRONG = 'mauvais mot de passe synthétique';
const STEP_MS = 30_000;
const SUBJECT = 'Export de vos données demandé sur votre compte OZ';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;

async function account(): Promise<{ email: string; accessToken: string }> {
  const email = `export-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(email, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  const login = await request(server).post('/auth/login').send({ email, password: PASSWORD });
  return { email, accessToken: (login.body as { accessToken: string }).accessToken };
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
  // L'activation ferme les autres sessions, pas celle-ci.
  return { ...created, secret };
}

const ask = (accessToken: string, body: object) =>
  request(server)
    .post('/account/data-export')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);
const follow = (accessToken: string) =>
  request(server).get('/account/data-export').set('Authorization', `Bearer ${accessToken}`);

const requestsOf = async (email: string): Promise<string[]> =>
  (
    await harness.db.query<{ status: string }>(
      `SELECT r.status FROM data_export_requests r JOIN users u ON u.id = r.user_id
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

describe('/account/data-export', () => {
  it('sans session : 401 sur la demande et le suivi', async () => {
    await request(server).post('/account/data-export').send({ password: PASSWORD }).expect(401);
    await request(server).get('/account/data-export').expect(401);
  });

  it('compte sans rôle : 202 `pending`, suivi sans cache, audit, alerte au titulaire', async () => {
    const { email, accessToken } = await account();
    const none = await follow(accessToken).expect(200);
    expect(none.body).toEqual({ latest: null });
    expect(none.headers['cache-control']).toBe('no-store');

    const response = await ask(accessToken, { password: PASSWORD }).expect(202);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as { status: string; requestedAt: string; nextRequestAt: string };
    expect(body).toMatchObject({ status: 'pending', readyAt: null, expiresAt: null });
    expect(Date.parse(body.nextRequestAt) - Date.parse(body.requestedAt)).toBe(24 * 3600 * 1000);
    expect(await requestsOf(email)).toEqual(['pending']);

    const followed = await follow(accessToken).expect(200);
    expect(followed.headers['cache-control']).toBe('no-store');
    expect(followed.body).toEqual({ latest: body });

    const audit = await harness.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log a JOIN users u ON u.id = a.actor_user_id
       WHERE u.email = $1 AND a.action = 'data.export.requested'`,
      [email],
    );
    expect(audit.rows[0]?.n).toBe(1);
    await harness.app.get(MailDispatcher).flush();
    expect(await harness.mailTo(email, SUBJECT)).toContain('Un export des données');
  });

  it('demande active : 409 `DATA_EXPORT_ACTIVE` ; expirée depuis moins de 24 heures : `DATA_EXPORT_TOO_SOON`', async () => {
    const { email, accessToken } = await account();
    await ask(accessToken, { password: PASSWORD }).expect(202);
    const active = await ask(accessToken, { password: PASSWORD }).expect(409);
    expect(errorOf(active).code).toBe('DATA_EXPORT_ACTIVE');
    await harness.db.query(
      `UPDATE data_export_requests SET status = 'expired'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    const tooSoon = await ask(accessToken, { password: PASSWORD }).expect(409);
    expect(errorOf(tooSoon).code).toBe('DATA_EXPORT_TOO_SOON');
    const wait = Number(tooSoon.headers['retry-after']);
    expect(wait).toBeGreaterThan(23 * 3600);
    expect(wait).toBeLessThanOrEqual(24 * 3600);
    expect(await requestsOf(email)).toEqual(['expired']);
  });

  it('mot de passe faux, code manquant ou faux : même 403, aucune demande', async () => {
    const plain = await account();
    const wrong = await ask(plain.accessToken, { password: WRONG }).expect(403);
    expect(errorOf(wrong).code).toBe('DATA_EXPORT_REJECTED');

    const { email, accessToken, secret } = await enrolled();
    const missing = await ask(accessToken, { password: PASSWORD }).expect(403);
    const badCode = await ask(accessToken, { password: PASSWORD, code: '000000' }).expect(403);
    const badPassword = await ask(accessToken, {
      password: WRONG,
      code: generateTotpCode(secret, Date.now()),
    }).expect(403);
    for (const response of [missing, badCode, badPassword]) {
      expect(errorOf(response).code).toBe('DATA_EXPORT_REJECTED');
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
      data_export_request_account: { limit: 1, windowSeconds: 3600 },
    });
    await ask(accessToken, { password: WRONG }).expect(403);
    const limited = await ask(accessToken, { password: PASSWORD }).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('ni mot de passe ni code au journal', async () => {
    const { accessToken, secret } = await enrolled();
    const code = generateTotpCode(secret, Date.now());
    await ask(accessToken, { password: PASSWORD, code }).expect(202);
    const lines = harness.logs.lines();
    expect(JSON.stringify(lines)).toContain('/account/data-export');
    const logs = JSON.stringify(lines);
    expect(logs).not.toContain(PASSWORD);
    expect(logs).not.toContain(WRONG);
    expect(logs).not.toContain(secret);
  });
});

// Lot 1.16bb : mise en file pour le worker, téléchargement par URL signée.
describe('mise en file et téléchargement', () => {
  const download = (accessToken: string) =>
    request(server)
      .get('/account/data-export/download')
      .set('Authorization', `Bearer ${accessToken}`);

  it('demande acceptée : job `build-export` en file, identifiant de la demande seul', async () => {
    const { email, accessToken } = await account();
    await ask(accessToken, { password: PASSWORD }).expect(202);
    const [row] = (
      await harness.db.query<{ id: string }>(
        `SELECT r.id::text FROM data_export_requests r JOIN users u ON u.id = r.user_id
         WHERE u.email = $1`,
        [email],
      )
    ).rows;
    const queue = new Queue('data-export', { connection: harness.redis });
    try {
      const job = await queue.getJob(row?.id ?? '');
      expect(job?.name).toBe('build-export');
      expect(job?.data).toEqual({ requestId: row?.id });
      expect(job?.opts.attempts).toBe(3);
    } finally {
      await queue.close();
    }
  });

  it('sans archive : 404 ; prête : URL de 5 minutes, sans cache, auditée ; échue : 404', async () => {
    const { email, accessToken } = await account();
    const none = await download(accessToken).expect(404);
    expect(errorOf(none).code).toBe('DATA_EXPORT_NOT_FOUND');

    await ask(accessToken, { password: PASSWORD }).expect(202);
    await harness.db.query(
      `UPDATE data_export_requests r SET status = 'ready', storage_key = 'exports/' || r.id || '.json',
         ready_at = now(), expires_at = now() + interval '7 days'
       FROM users u WHERE u.id = r.user_id AND u.email = $1`,
      [email],
    );
    const ok = await download(accessToken).expect(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    const body = ok.body as { url: string; expiresAt: string };
    const url = new URL(body.url);
    expect(url.pathname).toMatch(/\/exports\/[0-9a-f-]{36}\.json$/);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment');
    expect(new Date(body.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 300_000);
    const audit = await harness.db.query(
      `SELECT 1 FROM audit_log a JOIN users u ON u.id = a.actor_user_id
       WHERE a.action = 'data.export.downloaded' AND u.email = $1`,
      [email],
    );
    expect(audit.rowCount).toBe(1);
    expect(JSON.stringify(harness.logs.lines())).not.toContain(url.pathname);

    await harness.db.query(
      `UPDATE data_export_requests r SET ready_at = now() - interval '8 days',
         expires_at = now() - interval '1 second'
       FROM users u WHERE u.id = r.user_id AND u.email = $1`,
      [email],
    );
    await download(accessToken).expect(404);
  });

  it('sans session : 401', async () => {
    await request(server).get('/account/data-export/download').expect(401);
  });
});
