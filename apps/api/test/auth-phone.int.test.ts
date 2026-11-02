import { RATE_LIMIT_DEFAULTS } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { MailDispatcher } from '../src/auth/mail/mail-dispatcher.js';
import { SmsDispatcher } from '../src/auth/sms-dispatcher.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Vérification du téléphone (lot 1.3cc, EX-111 n° 2, TD-012, D3 à D9).

const PASSWORD = 'correct horse battery staple';
const PHONE = '+237650000001';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;
const phoneNumber = (): string => `+23765${String(1_000_000 + ++counter)}`;

async function account(): Promise<{ address: string; token: string; userId: string }> {
  const address = `phone-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const verify = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token: verify }).expect(200);
  const login = await request(server)
    .post('/auth/login')
    .send({ email: address, password: PASSWORD })
    .expect(200);
  const rows = await harness.db.query<{ id: string }>(
    'SELECT id::text FROM users WHERE email = $1',
    [address],
  );
  return {
    address,
    token: (login.body as { accessToken: string }).accessToken,
    userId: rows.rows[0]?.id as string,
  };
}

const post = (path: string, token: string) =>
  request(server).post(path).set('Authorization', `Bearer ${token}`);

async function sent(): Promise<{ to: string; code: string; only: string | undefined }> {
  await harness.app.get(SmsDispatcher).flush();
  const last = harness.sms.at(-1);
  if (last === undefined) throw new Error('aucun envoi');
  return last;
}

async function clearCooldowns(): Promise<void> {
  const redis = harness.redis;
  const keys = await redis.keys('oz:auth:phone-cooldown:*');
  if (keys.length > 0) await redis.del(...keys);
}

const verifiedAt = async (userId: string): Promise<Date | null> =>
  (
    await harness.db.query<{ phone_verified_at: Date | null }>(
      'SELECT phone_verified_at FROM users WHERE id = $1::uuid',
      [userId],
    )
  ).rows[0]?.phone_verified_at ?? null;

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
}, 180_000);
afterAll(async () => {
  await harness.stop();
});
afterEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
  harness.smsFails = false;
});

describe('POST /auth/phone/start et /verify', () => {
  it('sans jeton : 401 sur les deux routes', async () => {
    await request(server).post('/auth/phone/start').send({ phone: PHONE }).expect(401);
    await request(server).post('/auth/phone/verify').send({ code: '000000' }).expect(401);
  });

  it('parcours : envoi après la réponse, code juste, numéro prouvé en base', async () => {
    const { token, userId } = await account();
    const phone = phoneNumber();
    const started = await post('/auth/phone/start', token).send({ phone }).expect(202);
    expect(started.body).toEqual({ expiresIn: 300, resendAfter: 60 });
    expect(await verifiedAt(userId)).toBeNull();
    const { code, to, only } = await sent();
    expect(to).toBe(phone);
    expect(only).toBeUndefined();
    await post('/auth/phone/verify', token).send({ code }).expect(204);
    expect(await verifiedAt(userId)).not.toBeNull();
    // Rejeu refusé.
    const replay = await post('/auth/phone/verify', token).send({ code }).expect(422);
    expect(errorOf(replay).code).toBe('PHONE_CODE_INVALID');
  });

  it('code faux, absent ou épuisé : même réponse, date inchangée', async () => {
    const { token, userId } = await account();
    const none = await post('/auth/phone/verify', token).send({ code: '000000' }).expect(422);
    await post('/auth/phone/start', token).send({ phone: phoneNumber() }).expect(202);
    const { code } = await sent();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      const response = await post('/auth/phone/verify', token).send({ code: wrong }).expect(422);
      expect(response.body).toMatchObject({ code: errorOf(none).code });
    }
    await post('/auth/phone/verify', token).send({ code }).expect(422);
    expect(await verifiedAt(userId)).toBeNull();
  });

  it('indicatif hors liste : 422 avant tout envoi', async () => {
    const { token } = await account();
    const before = harness.sms.length;
    const response = await post('/auth/phone/start', token)
      .send({ phone: '+33612345678' })
      .expect(422);
    expect(errorOf(response).code).toBe('PHONE_COUNTRY_UNSUPPORTED');
    await harness.app.get(SmsDispatcher).flush();
    expect(harness.sms).toHaveLength(before);
  });

  it('renvoi avant 60 s : 429 avec l’attente ; le canal sms est transmis ensuite', async () => {
    const { token } = await account();
    const phone = phoneNumber();
    await post('/auth/phone/start', token).send({ phone }).expect(202);
    const first = await sent();
    const early = await post('/auth/phone/start', token).send({ phone }).expect(429);
    expect(errorOf(early).code).toBe('RATE_LIMITED');
    expect(Number(early.headers['retry-after'])).toBeGreaterThan(50);
    await clearCooldowns();
    await post('/auth/phone/start', token).send({ phone, channel: 'sms' }).expect(202);
    const second = await sent();
    expect(second.only).toBe('sms');
    // Le premier code ne vaut plus.
    if (first.code !== second.code) {
      await post('/auth/phone/verify', token).send({ code: first.code }).expect(422);
    }
    await post('/auth/phone/verify', token).send({ code: second.code }).expect(204);
  });

  it('échec de toute la chaîne : même réponse, journal sans numéro ni code', async () => {
    const { token } = await account();
    const phone = phoneNumber();
    harness.smsFails = true;
    const offset = harness.logs.raw().length;
    await post('/auth/phone/start', token).send({ phone }).expect(202);
    await harness.app.get(SmsDispatcher).flush();
    const logs = harness.logs.raw().slice(offset);
    expect(logs).toContain('auth.otp.failed');
    expect(logs).not.toContain(phone);
    expect(logs).not.toContain(phone.slice(1));
  });

  it('succès : journal sans numéro ni code', async () => {
    const { token } = await account();
    const phone = phoneNumber();
    const offset = harness.logs.raw().length;
    await post('/auth/phone/start', token).send({ phone }).expect(202);
    const { code } = await sent();
    await post('/auth/phone/verify', token).send({ code }).expect(204);
    const logs = harness.logs.raw().slice(offset);
    expect(logs).toContain('auth.otp.sent');
    expect(logs).not.toContain(phone);
    expect(logs).not.toContain(`"${code}"`);
  });

  it('changement d’un numéro déjà vérifié : alerte par email, pas au premier numéro', async () => {
    const { address, token } = await account();
    const verify = async (phone: string): Promise<void> => {
      await clearCooldowns();
      await post('/auth/phone/start', token).send({ phone }).expect(202);
      const { code } = await sent();
      await post('/auth/phone/verify', token).send({ code }).expect(204);
      await harness.app.get(MailDispatcher).flush();
    };
    const SUBJECT = 'Numéro de téléphone modifié sur votre compte OZ';
    const phone = phoneNumber();
    await verify(phone);
    expect(await harness.subjectsTo(address)).not.toContain(SUBJECT);
    await verify(phone);
    expect(await harness.subjectsTo(address)).not.toContain(SUBJECT);
    await verify(phoneNumber());
    const body = await harness.mailTo(address, SUBJECT);
    expect(body).not.toContain('+237');
  });

  it('compte à 2FA obligatoire non enrôlé : 403 sur les deux routes', async () => {
    const { token, userId } = await account();
    await harness.db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, 'admin')`, [
      userId,
    ]);
    for (const [path, body] of [
      ['/auth/phone/start', { phone: PHONE }],
      ['/auth/phone/verify', { code: '000000' }],
    ] as const) {
      const response = await post(path, token).send(body).expect(403);
      expect(errorOf(response).code).toBe('AUTH_2FA_ENROLLMENT_REQUIRED');
    }
  });

  it('compte suspendu après le code : refusé, rien d’écrit', async () => {
    const { token, userId } = await account();
    await post('/auth/phone/start', token).send({ phone: phoneNumber() }).expect(202);
    const { code } = await sent();
    await harness.db.query(`UPDATE users SET status = 'suspended' WHERE id = $1::uuid`, [userId]);
    await post('/auth/phone/verify', token).send({ code }).expect(401);
    expect(await verifiedAt(userId)).toBeNull();
  });

  describe('limites (D9)', () => {
    it.each([
      ['otp_start_ip', 'start'],
      ['otp_start_account', 'start'],
      ['otp_start_phone', 'start'],
      ['otp_verify_ip', 'verify'],
      ['otp_verify_account', 'verify'],
    ] as const)('%s : 429 RATE_LIMITED avec Retry-After', async (rule, route) => {
      const { token } = await account();
      await harness.setRateLimits({
        ...RELAXED_RATE_LIMITS,
        [rule]: { limit: 1, windowSeconds: RATE_LIMIT_DEFAULTS[rule].windowSeconds },
      });
      await harness.redis.flushdb();
      const call = () =>
        route === 'start'
          ? post('/auth/phone/start', token).send({ phone: PHONE })
          : post('/auth/phone/verify', token).send({ code: '000000' });
      await call();
      await clearCooldowns();
      const refused = await call().expect(429);
      expect(errorOf(refused).code).toBe('RATE_LIMITED');
      expect(refused.headers['retry-after']).toBeDefined();
    });
  });
});
