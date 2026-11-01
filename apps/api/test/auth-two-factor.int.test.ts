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

// 2FA TOTP (lot 1.3cb, EX-103 n° 7, CP-28) : enrôlement, connexion en deux étapes, rôles obligatoires.

const PASSWORD = 'correct horse battery staple';
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
const CURL = 'curl/8.7.1';
const STEP_MS = 30_000;
const COOKIE = '__Host-oz_refresh';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;

interface Enrolled {
  readonly email: string;
  readonly accessToken: string;
  readonly secret: string;
  readonly recoveryCodes: string[];
}

async function account(): Promise<string> {
  const address = `totp-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  return address;
}

const login = (address: string, agent = FIREFOX) =>
  request(server)
    .post('/auth/login')
    .set('User-Agent', agent)
    .send({ email: address, password: PASSWORD });

const secondStep = (challengeToken: string, code: string, agent = FIREFOX) =>
  request(server).post('/auth/login/2fa').set('User-Agent', agent).send({ challengeToken, code });

const post = (path: string, accessToken: string) =>
  request(server).post(path).set('Authorization', `Bearer ${accessToken}`);

async function accessTokenOf(address: string): Promise<string> {
  const response = await login(address).expect(200);
  return (response.body as { accessToken: string }).accessToken;
}

/** Enrôle à l'instant décalé d'un pas en arrière : le pas courant reste libre pour la connexion. */
async function enrolled(): Promise<Enrolled> {
  const address = await account();
  const accessToken = await accessTokenOf(address);
  const setup = await post('/auth/2fa/setup', accessToken).expect(200);
  const { secret } = setup.body as { secret: string };
  const enable = await post('/auth/2fa/enable', accessToken)
    .send({ code: generateTotpCode(secret, Date.now() - STEP_MS) })
    .expect(200);
  const { recoveryCodes } = enable.body as { recoveryCodes: string[] };
  return { email: address, accessToken, secret, recoveryCodes };
}

async function challengeOf(address: string): Promise<string> {
  const response = await login(address).expect(200);
  const body = response.body as { status: string; challengeToken: string };
  expect(body.status).toBe('2fa_required');
  return body.challengeToken;
}

/** Emails « nouvel appareil » reçus, attendus jusqu'à `expected` (1 s au plus). */
async function deviceAlerts(address: string, expected: number): Promise<number> {
  const deadline = Date.now() + 1_000;
  for (;;) {
    const subjects = await harness.subjectsTo(address);
    const count = subjects.filter((s) => s === 'Nouvelle connexion à votre compte OZ').length;
    if (count >= expected || Date.now() > deadline) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const flushMail = () => harness.app.get(MailDispatcher).flush();

const grantRole = async (address: string, role: 'admin') =>
  harness.db.query(
    `INSERT INTO user_roles (user_id, role) SELECT id, $2::role_kind FROM users WHERE email = $1`,
    [address, role],
  );

const setCookies = (response: { headers: Record<string, unknown> }): string[] => {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? (header as string[]) : [];
};

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

describe('enrôlement', () => {
  it.each(['setup', 'enable', 'disable', 'recovery-codes'])(
    'POST /auth/2fa/%s sans session : 401',
    async (route) => {
      await request(server).post(`/auth/2fa/${route}`).expect(401);
    },
  );

  it('le secret n’est actif qu’après un premier code valide', async () => {
    const address = await account();
    const token = await accessTokenOf(address);
    const setup = await post('/auth/2fa/setup', token).expect(200);
    const body = setup.body as { secret: string; uri: string; qrSvg: string };
    expect(body.uri).toContain(body.secret);
    expect(body.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(body.uri).not.toContain('example.test');
    expect(body.qrSvg).toMatch(/^<svg/);
    expect(setup.headers['cache-control']).toBe('no-store');

    // Code faux : rien ne change, la connexion reste à un seul facteur.
    await post('/auth/2fa/enable', token).send({ code: '000000' }).expect(403);
    await login(address)
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('accessToken');
      });

    const enable = await post('/auth/2fa/enable', token)
      .send({ code: generateTotpCode(body.secret, Date.now()) })
      .expect(200);
    const { recoveryCodes } = enable.body as { recoveryCodes: string[] };
    expect(recoveryCodes).toHaveLength(10);
    await flushMail();
    expect(await harness.subjectsTo(address)).toContain(
      'Validation en deux étapes activée sur votre compte OZ',
    );
    await challengeOf(address);
  });

  it('enable sans setup : 409', async () => {
    const token = await accessTokenOf(await account());
    const response = await post('/auth/2fa/enable', token).send({ code: '123456' }).expect(409);
    expect(errorOf(response).code).toBe('AUTH_2FA_NOT_PENDING');
  });

  it('activation : les autres sessions tombent, la session courante reste', async () => {
    const address = await account();
    const token = await accessTokenOf(address);
    const other = await accessTokenOf(address);
    const setup = await post('/auth/2fa/setup', token).expect(200);
    await post('/auth/2fa/enable', token)
      .send({ code: generateTotpCode((setup.body as { secret: string }).secret, Date.now()) })
      .expect(200);
    await request(server).get('/auth/sessions').set('Authorization', `Bearer ${other}`).expect(401);
    await request(server).get('/auth/sessions').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('changement d’appareil : code de l’appareil actuel exigé, secret actif intact sinon', async () => {
    const user = await enrolled();
    const setup = await post('/auth/2fa/setup', user.accessToken).expect(200);
    const next = (setup.body as { secret: string }).secret;
    const code = generateTotpCode(next, Date.now());
    await post('/auth/2fa/enable', user.accessToken).send({ code }).expect(403);
    await post('/auth/2fa/enable', user.accessToken)
      .send({ code, currentCode: generateTotpCode(user.secret, Date.now()) })
      .expect(200);
    const challenge = await challengeOf(user.email);
    await secondStep(challenge, generateTotpCode(user.secret, Date.now() + STEP_MS)).expect(401);
    await secondStep(challenge, generateTotpCode(next, Date.now() + STEP_MS)).expect(200);
  });

  it('aucun secret ni code dans les journaux', async () => {
    const user = await enrolled();
    const logs = harness.logs.raw();
    expect(logs).not.toContain(user.secret);
    expect(logs).not.toContain(user.recoveryCodes[0]);
  });
});

describe('connexion en deux étapes (D4)', () => {
  it('sans second facteur : ni cookie, ni session, ni email « nouvel appareil »', async () => {
    const user = await enrolled();
    const before = await deviceAlerts(user.email, 1);
    const response = await login(user.email, CURL).expect(200);
    expect(setCookies(response)).toHaveLength(0);
    expect(response.body).not.toHaveProperty('accessToken');
    await flushMail();
    expect(await deviceAlerts(user.email, before)).toBe(before);
  });

  it('avec le code : session ouverte, cookie posé, email « nouvel appareil » parti', async () => {
    const user = await enrolled();
    const before = await deviceAlerts(user.email, 1);
    const challenge = (
      (await login(user.email, CURL).expect(200)).body as { challengeToken: string }
    ).challengeToken;
    const done = await secondStep(
      challenge,
      generateTotpCode(user.secret, Date.now()),
      CURL,
    ).expect(200);
    expect(done.body).toHaveProperty('accessToken');
    expect(setCookies(done).join()).toContain(COOKIE);
    await flushMail();
    expect(await deviceAlerts(user.email, before + 1)).toBe(before + 1);
  });

  it('un code ne sert qu’une fois, même avec un nouveau défi (D2)', async () => {
    const user = await enrolled();
    const code = generateTotpCode(user.secret, Date.now());
    await secondStep(await challengeOf(user.email), code).expect(200);
    const replay = await secondStep(await challengeOf(user.email), code).expect(401);
    expect(errorOf(replay).code).toBe('AUTH_2FA_INVALID');
  });

  it('défi à usage unique et réponse identique à un défi inconnu', async () => {
    const user = await enrolled();
    const challenge = await challengeOf(user.email);
    await secondStep(challenge, generateTotpCode(user.secret, Date.now())).expect(200);
    const replay = await secondStep(challenge, generateTotpCode(user.secret, Date.now() + STEP_MS));
    const unknown = await secondStep('a'.repeat(43), '123456');
    expect(replay.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(errorOf(replay).code).toBe(errorOf(unknown).code);
    expect(errorOf(replay).message).toBe(errorOf(unknown).message);
  });

  it('5 essais par défi, puis le défi tombe, même avec le bon code', async () => {
    const user = await enrolled();
    const challenge = await challengeOf(user.email);
    for (let i = 0; i < 5; i++) {
      // Le délai exponentiel (429) coupe la série, l'essai reste compté.
      expect([401, 429]).toContain((await secondStep(challenge, '000000')).status);
    }
    const spent = await secondStep(challenge, generateTotpCode(user.secret, Date.now())).expect(
      401,
    );
    expect(errorOf(spent).code).toBe('AUTH_2FA_INVALID');
  });

  it('délai exponentiel après des codes faux, qu’un mot de passe juste n’efface pas (D8)', async () => {
    const user = await enrolled();
    for (let i = 0; i < 3; i++) {
      await secondStep(await challengeOf(user.email), '000000').expect(401);
    }
    const blocked = await secondStep(
      await challengeOf(user.email),
      generateTotpCode(user.secret, Date.now()),
    ).expect(429);
    expect(errorOf(blocked).code).toBe('AUTH_RETRY_LATER');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limite login_totp_account par compte : 429 RATE_LIMITED', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      login_totp_account: { limit: 1, windowSeconds: 60 },
    });
    const user = await enrolled();
    await secondStep(await challengeOf(user.email), '000000').expect(401);
    const refused = await secondStep(await challengeOf(user.email), '000000').expect(429);
    expect(errorOf(refused).code).toBe('RATE_LIMITED');
  });

  it('code de secours : accepté une fois, alerte envoyée', async () => {
    const user = await enrolled();
    const code = user.recoveryCodes[0] as string;
    await secondStep(await challengeOf(user.email), code.toLowerCase()).expect(200);
    await flushMail();
    const body = await harness.mailTo(user.email, 'Code de secours utilisé sur votre compte OZ');
    expect(body).not.toContain(code);
    await secondStep(await challengeOf(user.email), code).expect(401);
  });

  it('compte suspendu entre les deux étapes : même refus', async () => {
    const user = await enrolled();
    const challenge = await challengeOf(user.email);
    await harness.db.query(`UPDATE users SET status = 'suspended' WHERE email = $1`, [user.email]);
    const refused = await secondStep(challenge, generateTotpCode(user.secret, Date.now())).expect(
      401,
    );
    expect(errorOf(refused).code).toBe('AUTH_2FA_INVALID');
  });

  it('mot de passe réinitialisé après le défi : le défi ne vaut plus', async () => {
    const user = await enrolled();
    const challenge = await challengeOf(user.email);
    await request(server).post('/auth/password/forgot').send({ email: user.email }).expect(202);
    const token = tokenIn(
      await harness.mailTo(user.email, 'Réinitialisation de votre mot de passe'),
    );
    await request(server)
      .post('/auth/password/reset')
      .send({ token, password: `${PASSWORD} bis` })
      .expect(200);
    await secondStep(challenge, generateTotpCode(user.secret, Date.now())).expect(401);
  });

  it('compte sans 2FA : connexion inchangée, sans défi', async () => {
    const response = await login(await account()).expect(200);
    expect(Object.keys(response.body as object).sort()).toEqual(['accessToken', 'expiresIn']);
  });
});

describe('désactivation et codes de secours (D5, D7)', () => {
  it('exige le mot de passe et le code ; révoque les autres sessions', async () => {
    const user = await enrolled();
    const code = generateTotpCode(user.secret, Date.now());
    const wrong = await post('/auth/2fa/disable', user.accessToken)
      .send({ password: 'mauvais mot de passe', code })
      .expect(403);
    const noCode = await post('/auth/2fa/disable', user.accessToken)
      .send({ password: PASSWORD, code: '000000' })
      .expect(403);
    expect(errorOf(wrong).code).toBe(errorOf(noCode).code);

    const other = await secondStep(await challengeOf(user.email), code).expect(200);
    await post('/auth/2fa/disable', user.accessToken)
      .send({ password: PASSWORD, code: generateTotpCode(user.secret, Date.now() + STEP_MS) })
      .expect(204);
    await request(server)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${(other.body as { accessToken: string }).accessToken}`)
      .expect(401);
    await flushMail();
    await harness.mailTo(user.email, 'Validation en deux étapes désactivée sur votre compte OZ');
    expect((await login(user.email).expect(200)).body).toHaveProperty('accessToken');
  });

  it('régénération : l’ancien lot cesse de valoir', async () => {
    const user = await enrolled();
    const response = await post('/auth/2fa/recovery-codes', user.accessToken)
      .send({ code: generateTotpCode(user.secret, Date.now()) })
      .expect(200);
    const { recoveryCodes } = response.body as { recoveryCodes: string[] };
    await secondStep(await challengeOf(user.email), user.recoveryCodes[0] as string).expect(401);
    await secondStep(await challengeOf(user.email), recoveryCodes[0] as string).expect(200);
    await flushMail();
    await harness.mailTo(user.email, 'Codes de secours régénérés sur votre compte OZ');
  });

  it('régénération : un code de secours ne suffit pas (D5)', async () => {
    const user = await enrolled();
    await post('/auth/2fa/recovery-codes', user.accessToken)
      .send({ code: user.recoveryCodes[0] })
      .expect(422);
  });

  it('sans 2FA active : 409', async () => {
    const token = await accessTokenOf(await account());
    await post('/auth/2fa/recovery-codes', token).send({ code: '123456' }).expect(409);
    await post('/auth/2fa/disable', token).send({ password: PASSWORD, code: '123456' }).expect(409);
  });
});

describe('rôles à 2FA obligatoire (D6)', () => {
  it('session restreinte : 403 partout sauf enrôlement et déconnexion', async () => {
    const address = await account();
    await grantRole(address, 'admin');
    const token = await accessTokenOf(address);
    const refused = await request(server)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(errorOf(refused).code).toBe('AUTH_2FA_ENROLLMENT_REQUIRED');

    const setup = await post('/auth/2fa/setup', token).expect(200);
    await post('/auth/2fa/enable', token)
      .send({ code: generateTotpCode((setup.body as { secret: string }).secret, Date.now()) })
      .expect(200);
    await request(server).get('/auth/sessions').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('rôle attribué après la connexion : restriction dès la requête suivante', async () => {
    const address = await account();
    const token = await accessTokenOf(address);
    await request(server).get('/auth/sessions').set('Authorization', `Bearer ${token}`).expect(200);
    await grantRole(address, 'admin');
    await request(server).get('/auth/sessions').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('session restreinte : la déconnexion de tous les appareils reste possible', async () => {
    const address = await account();
    await grantRole(address, 'admin');
    await post('/auth/logout-all', await accessTokenOf(address)).expect(204);
  });

  it('désactivation refusée pour ces rôles', async () => {
    const user = await enrolled();
    await grantRole(user.email, 'admin');
    const refused = await post('/auth/2fa/disable', user.accessToken)
      .send({ password: PASSWORD, code: generateTotpCode(user.secret, Date.now()) })
      .expect(403);
    expect(errorOf(refused).code).toBe('AUTH_2FA_REQUIRED');
  });
});
