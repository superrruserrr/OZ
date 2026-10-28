import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { MailDispatcher } from '../src/auth/mail/mail-dispatcher.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Limites de débit des routes d'authentification (lot 1.3ca, EX-T18 n° 1 et 2). Derrière un
// mandataire de confiance (TRUST_PROXY=1) : chaque test choisit son IP par X-Forwarded-For.

const PASSWORD = 'correct horse battery staple';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;
const email = (): string => `debit-${String(++counter)}@example.test`;
const ip = (): string => `198.51.100.${String(++counter % 250)}`;

const post = (path: string, from: string, body: object, userAgent?: string) => {
  const call = request(server).post(path).set('X-Forwarded-For', from);
  if (userAgent !== undefined) call.set('User-Agent', userAgent);
  return call.send(body);
};

async function account(address = email()): Promise<string> {
  await post('/auth/register', ip(), {
    email: address,
    password: PASSWORD,
    formToken: formToken(),
  }).expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await post('/auth/verify-email', ip(), { token }).expect(200);
  return address;
}

const limits = (overrides: object) =>
  harness.setRateLimits({ ...RELAXED_RATE_LIMITS, ...overrides });

beforeAll(async () => {
  harness = await startAuthHarness({ TRUST_PROXY: '1' });
  server = harness.app.getHttpServer();
}, 180_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await limits({});
});

function expectRateLimited(response: request.Response): void {
  expect(response.status).toBe(429);
  expect(errorOf(response).code).toBe('RATE_LIMITED');
  expect(response.headers['retry-after']).toMatch(/^[1-9]\d*$/);
}

describe('connexion (EX-T18 n° 1, 2)', () => {
  it('6e tentative en 15 min depuis une IP : 429 RATE_LIMITED avec Retry-After', async () => {
    await limits({ login_ip: { limit: 5, windowSeconds: 900 } });
    const from = ip();
    for (let i = 0; i < 5; i++) {
      await post('/auth/login', from, { email: email(), password: PASSWORD }).expect(401);
    }
    expectRateLimited(await post('/auth/login', from, { email: email(), password: PASSWORD }));
    // Une autre IP n'est pas concernée.
    await post('/auth/login', ip(), { email: email(), password: PASSWORD }).expect(401);
  });

  it('au-delà de la limite du compte, depuis des IP différentes : 429', async () => {
    await limits({ login_account: { limit: 2, windowSeconds: 3600 } });
    const address = await account();
    await post('/auth/login', ip(), { email: address, password: 'mauvais' }).expect(401);
    await post('/auth/login', ip(), { email: address, password: 'mauvais' }).expect(401);
    // Casse et espaces : même compteur que l'adresse normalisée.
    expectRateLimited(
      await post('/auth/login', ip(), { email: ` ${address.toUpperCase()} `, password: PASSWORD }),
    );
  });

  it('compte existant ou non : mêmes réponses (CP-28)', async () => {
    await limits({ login_account: { limit: 2, windowSeconds: 3600 } });
    const sequence = async (address: string) => {
      const statuses: [number, string][] = [];
      for (let i = 0; i < 3; i++) {
        const response = await post('/auth/login', ip(), { email: address, password: 'mauvais' });
        statuses.push([response.status, errorOf(response).code]);
      }
      return statuses;
    };
    expect(await sequence(await account())).toEqual(await sequence(email()));
  });

  it('le délai exponentiel de 1.3a reste appliqué sous la limite de débit', async () => {
    const address = await account();
    for (let i = 0; i < 3; i++) {
      await post('/auth/login', ip(), { email: address, password: 'mauvais' }).expect(401);
    }
    const response = await post('/auth/login', ip(), { email: address, password: PASSWORD });
    expect(response.status).toBe(429);
    expect(errorOf(response).code).toBe('AUTH_RETRY_LATER');
    expect(response.headers['retry-after']).toMatch(/^[1-9]\d*$/);
  });
});

describe('inscription', () => {
  it('4e inscription en 1 h depuis une IP : 429', async () => {
    await limits({ register_ip: { limit: 3, windowSeconds: 3600 } });
    const from = ip();
    for (let i = 0; i < 3; i++) {
      await post('/auth/register', from, {
        email: email(),
        password: PASSWORD,
        formToken: formToken(),
      }).expect(202);
    }
    expectRateLimited(
      await post('/auth/register', from, {
        email: email(),
        password: PASSWORD,
        formToken: formToken(),
      }),
    );
  });

  it('mot de passe refusé (422) : l’adresse n’est pas consommée, la tentative corrigée passe', async () => {
    await limits({ register_email: { limit: 1, windowSeconds: 3600 } });
    const address = email();
    harness.pwned = 'breached';
    await post('/auth/register', ip(), {
      email: address,
      password: PASSWORD,
      formToken: formToken(),
    }).expect(422);
    harness.pwned = 'clean';
    await post('/auth/register', ip(), {
      email: address,
      password: PASSWORD,
      formToken: formToken(),
    }).expect(202);
  });

  it('2e inscription avec la même adresse dans la fenêtre : 429', async () => {
    await limits({ register_email: { limit: 1, windowSeconds: 3600 } });
    const address = email();
    await post('/auth/register', ip(), {
      email: address,
      password: PASSWORD,
      formToken: formToken(),
    }).expect(202);
    expectRateLimited(
      await post('/auth/register', ip(), {
        email: address,
        password: PASSWORD,
        formToken: formToken(),
      }),
    );
  });
});

describe('jeton de formulaire (D6)', () => {
  it('GET /auth/register/form : jeton signé, non mis en cache, limité par IP', async () => {
    await limits({ register_form_ip: { limit: 1, windowSeconds: 3600 } });
    const from = ip();
    const response = await request(server)
      .get('/auth/register/form')
      .set('X-Forwarded-For', from)
      .expect(200);
    expect((response.body as { formToken: string }).formToken).toMatch(
      /^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expectRateLimited(
      await request(server).get('/auth/register/form').set('X-Forwarded-For', from),
    );
  });
});

describe('autres routes limitées', () => {
  it.each([
    ['/auth/password/forgot', 'forgot_ip', () => ({ email: email() })],
    ['/auth/verify-email', 'verify_email_ip', () => ({ token: 'x'.repeat(43) })],
    ['/auth/password/reset', 'reset_ip', () => ({ token: 'x'.repeat(43), password: PASSWORD })],
    ['/auth/refresh', 'refresh_ip', () => ({})],
  ])('%s : limite par IP (%s)', async (path, rule, body) => {
    await limits({ [rule]: { limit: 1, windowSeconds: 3600 } });
    const from = ip();
    const first = await post(path, from, body());
    expect(first.status).not.toBe(429);
    expectRateLimited(await post(path, from, body()));
  });

  it('demande de réinitialisation : 1 par 15 min et par adresse', async () => {
    await limits({ forgot_email: { limit: 1, windowSeconds: 900 } });
    const address = email();
    await post('/auth/password/forgot', ip(), { email: address }).expect(202);
    expectRateLimited(await post('/auth/password/forgot', ip(), { email: address }));
  });
});

describe('emails « nouvel appareil » (D7)', () => {
  it('au-delà du plafond du jour : connexion réussie, email non envoyé', async () => {
    await limits({ new_device_email: { limit: 3, windowSeconds: 86_400 } });
    const address = await account();
    const agents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    ];
    for (const agent of agents) {
      await post('/auth/login', ip(), { email: address, password: PASSWORD }, agent).expect(200);
    }
    await harness.app.get(MailDispatcher).flush();
    const subjects = await harness.subjectsTo(address);
    expect(subjects.filter((s) => s === 'Nouvelle connexion à votre compte OZ')).toHaveLength(3);
    expect(harness.logs.lines().some((line) => line.event === 'auth.mail.capped')).toBe(true);
  });
});

describe('OpenAPI', () => {
  it('429 documenté sur chaque route limitée', async () => {
    const response = await request(server).get('/docs-json').expect(200);
    const paths = (
      response.body as {
        paths: Record<string, { post: { responses: object }; get: { responses: object } }>;
      }
    ).paths;
    expect(Object.keys(paths['/auth/register/form']?.get.responses ?? {})).toContain('429');
    for (const path of [
      '/auth/register',
      '/auth/verify-email',
      '/auth/password/forgot',
      '/auth/password/reset',
      '/auth/login',
      '/auth/refresh',
    ]) {
      expect(Object.keys(paths[path]?.post.responses ?? {}), path).toContain('429');
    }
  });
});
