import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { MailDispatcher } from '../src/auth/mail/mail-dispatcher.js';
import { startAuthHarness, tokenIn, type AuthHarness } from './auth-harness.js';

// Connexion, rafraîchissement, déconnexion (lot 1.3b, EX-103 n° 1, 3, 4, 5, 8, 9, 10).

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:3000';
const COOKIE = '__Host-oz_refresh';
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;

let harness: AuthHarness;
let server: App;
let counter = 0;
const email = (): string => `session-${String(++counter)}@example.test`;

/** Compte actif et vérifié. */
async function account(address = email()): Promise<string> {
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  return address;
}

const login = (address: string, password = PASSWORD) =>
  request(server).post('/auth/login').set('User-Agent', FIREFOX).send({ email: address, password });

/** Valeur du cookie de rafraîchissement posé par la réponse. */
function refreshCookie(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const match = cookies
    .map((cookie) => new RegExp(`^${COOKIE}=([^;]*)`).exec(cookie))
    .find((found) => found !== null);
  if (!match?.[1]) throw new Error('aucun cookie de rafraîchissement');
  return match[1];
}

const refresh = (cookie: string | null, origin: string | null = ORIGIN) => {
  const call = request(server).post('/auth/refresh');
  if (origin !== null) call.set('Origin', origin);
  if (cookie !== null) call.set('Cookie', `${COOKIE}=${cookie}`);
  return call;
};

const logout = (cookie: string | null, origin: string | null = ORIGIN) => {
  const call = request(server).post('/auth/logout');
  if (origin !== null) call.set('Origin', origin);
  if (cookie !== null) call.set('Cookie', `${COOKIE}=${cookie}`);
  return call;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
});
afterAll(async () => {
  await harness.stop();
});

describe('POST /auth/login', () => {
  it('rend un jeton d’accès de 15 min et pose le cookie de rafraîchissement (EX-103 n° 3, n° 4)', async () => {
    const address = await account();
    const response = await login(address).expect(200);
    expect(Object.keys(response.body as object).sort()).toEqual(['accessToken', 'expiresIn']);
    expect((response.body as { expiresIn: number }).expiresIn).toBe(900);
    const [header] = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(header).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`));
    const attributes = (header ?? '')
      .split('; ')
      .slice(1)
      .map((part) => part.toLowerCase());
    expect(attributes).toEqual(
      expect.arrayContaining(['path=/', 'httponly', 'secure', 'samesite=strict']),
    );
    expect(attributes.some((part) => part.startsWith('domain='))).toBe(false);
    const maxAge = Number(attributes.find((part) => part.startsWith('max-age='))?.slice(8));
    expect(maxAge).toBeGreaterThan(30 * 86_400 - 60);
    expect(maxAge).toBeLessThanOrEqual(30 * 86_400);
    // Le jeton d'accès n'est jamais dans un cookie.
    const accessToken = (response.body as { accessToken: string }).accessToken;
    expect(header).not.toContain(accessToken);
  });

  it('réponse générique identique : inconnu, mauvais mot de passe, suspendu, supprimé (CP-28)', async () => {
    const suspended = await account();
    const deleted = await account();
    await harness.db.query(`UPDATE users SET status = 'suspended' WHERE email = $1`, [suspended]);
    await harness.db.query(`UPDATE users SET deleted_at = now() WHERE email = $1`, [deleted]);
    const responses = [
      await login('absent@example.test'),
      await login(await account(), 'mauvais mot de passe'),
      await login(suspended),
      await login(deleted),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const messages = new Set(responses.map((response) => errorOf(response).message));
    expect(messages.size).toBe(1);
  });

  it('durée indiscernable : inconnu, mauvais mot de passe, suspendu, supprimé (CP-28)', async () => {
    // Le délai exponentiel compte les échecs par adresse : chaque essai prend des comptes neufs.
    const registered = async (): Promise<string> => {
      const address = email();
      await request(server)
        .post('/auth/register')
        .send({ email: address, password: PASSWORD })
        .expect(202);
      return address;
    };
    const timed = async (address: string, password: string): Promise<number> => {
      const started = performance.now();
      await login(address, password).expect(401);
      return performance.now() - started;
    };
    const samples = {
      unknown: [] as number[],
      wrong: [] as number[],
      suspended: [] as number[],
      deleted: [] as number[],
    };
    for (let i = 0; i < 50; i++) {
      const [wrong, suspended, deleted] = [
        await registered(),
        await registered(),
        await registered(),
      ];
      await harness.db.query(`UPDATE users SET status = 'suspended' WHERE email = $1`, [suspended]);
      await harness.db.query(`UPDATE users SET deleted_at = now() WHERE email = $1`, [deleted]);
      samples.unknown.push(await timed(`absent-${String(i)}@example.test`, PASSWORD));
      samples.wrong.push(await timed(wrong, 'mauvais mot de passe'));
      samples.suspended.push(await timed(suspended, PASSWORD));
      samples.deleted.push(await timed(deleted, PASSWORD));
    }
    const reference = median(samples.unknown);
    for (const values of [samples.wrong, samples.suspended, samples.deleted]) {
      const gap = Math.abs(median(values) - reference) / Math.max(median(values), reference);
      expect(gap).toBeLessThan(0.25);
    }
  }, 180_000);

  it('email non vérifié : 403, seulement après un mot de passe juste (EX-103 n° 9)', async () => {
    const address = email();
    await request(server).post('/auth/register').send({ email: address, password: PASSWORD });
    const wrong = await login(address, 'mauvais mot de passe').expect(401);
    expect(errorOf(wrong).code).toBe('AUTH_INVALID_CREDENTIALS');
    const right = await login(address).expect(403);
    expect(errorOf(right).code).toBe('AUTH_EMAIL_UNVERIFIED');
    expect(right.headers['set-cookie']).toBeUndefined();
  });

  it('délai exponentiel : 429 avec Retry-After en secondes (EX-103 n° 8)', async () => {
    const address = await account();
    for (let i = 0; i < 3; i++) await login(address, 'mauvais mot de passe').expect(401);
    const response = await login(address).expect(429);
    expect(errorOf(response).code).toBe('AUTH_RETRY_LATER');
    expect(response.headers['retry-after']).toMatch(/^[1-9]\d*$/);
  });

  it('refuse un corps invalide ou une clé inconnue', async () => {
    await request(server).post('/auth/login').send({ email: 'x', password: PASSWORD }).expect(422);
    await request(server)
      .post('/auth/login')
      .send({ email: email(), password: PASSWORD, role: 'admin' })
      .expect(422);
  });
});

describe('POST /auth/refresh (rotation, EX-103 n° 4, n° 5)', () => {
  it('rend un nouveau couple ; l’ancien cookie ne sert plus', async () => {
    const first = refreshCookie(await login(await account()).expect(200));
    const response = await refresh(first).expect(200);
    expect((response.body as { expiresIn: number }).expiresIn).toBe(900);
    const second = refreshCookie(response);
    expect(second).not.toBe(first);
    expect((await refresh(second).expect(200)).status).toBe(200);
  });

  it('réutilisation : 401, cookie effacé, famille révoquée (test de non-régression)', async () => {
    const first = refreshCookie(await login(await account()).expect(200));
    const second = refreshCookie(await refresh(first).expect(200));
    const replay = await refresh(first).expect(401);
    expect(errorOf(replay).code).toBe('AUTH_UNAUTHENTICATED');
    expect(String(replay.headers['set-cookie'])).toMatch(new RegExp(`^${COOKIE}=;`));
    // Le titulaire légitime est déconnecté aussi.
    await refresh(second).expect(401);
  });

  it('sans cookie, cookie mal formé ou inconnu : 401 identique', async () => {
    const responses = [
      await refresh(null).expect(401),
      await refresh('pas-un-jeton').expect(401),
      await refresh('A'.repeat(43)).expect(401),
    ];
    const shapes = responses.map(
      (response) => `${errorOf(response).code}|${errorOf(response).message}`,
    );
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).toMatch(/^AUTH_UNAUTHENTICATED\|/);
  });

  it('origine absente ou hors liste blanche : 403, rien n’est consommé (CSRF)', async () => {
    const cookie = refreshCookie(await login(await account()).expect(200));
    for (const origin of [null, 'https://evil.example']) {
      const response = await refresh(cookie, origin).expect(403);
      expect(errorOf(response).code).toBe('AUTH_ORIGIN_REFUSED');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    await refresh(cookie).expect(200);
  });
});

describe('POST /auth/logout', () => {
  it('révoque la famille et efface le cookie', async () => {
    const cookie = refreshCookie(await login(await account()).expect(200));
    const response = await logout(cookie).expect(204);
    expect(String(response.headers['set-cookie'])).toMatch(new RegExp(`^${COOKIE}=;`));
    await refresh(cookie).expect(401);
  });

  it('204 même sans cookie ou avec un cookie inconnu', async () => {
    await logout(null).expect(204);
    await logout('A'.repeat(43)).expect(204);
  });

  it('origine hors liste blanche : 403, session intacte', async () => {
    const cookie = refreshCookie(await login(await account()).expect(200));
    await logout(cookie, 'https://evil.example').expect(403);
    await refresh(cookie).expect(200);
  });
});

describe('journaux', () => {
  it('ne contiennent ni jeton, ni cookie, ni mot de passe, ni adresse', async () => {
    const address = await account();
    const response = await login(address).expect(200);
    const cookie = refreshCookie(response);
    await refresh(cookie).expect(200);
    const accessToken = (response.body as { accessToken: string }).accessToken;
    const logs = harness.logs.raw();
    for (const secret of [accessToken, cookie, PASSWORD, address]) {
      expect(logs).not.toContain(secret);
    }
  });
});

describe('session ouverte', () => {
  it('IP du client tronquée en /24, même reçue en IPv4 mappée sur IPv6', async () => {
    const address = await account();
    await login(address).expect(200);
    const { rows } = await harness.db.query<{ ip: string }>(
      `SELECT s.ip::text AS ip FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
      [address],
    );
    expect(rows.map((row) => row.ip)).toEqual(['127.0.0.0/24']);
  });
});

describe('OpenAPI', () => {
  it('documente connexion, rafraîchissement, déconnexion et sessions', async () => {
    const doc = (await request(server).get('/docs-json').expect(200)).body as {
      paths: Record<string, { post?: { responses: Record<string, unknown> } }>;
    };
    expect(Object.keys(doc.paths['/auth/login']?.post?.responses ?? {}).sort()).toEqual([
      '200',
      '401',
      '403',
      '429',
    ]);
    expect(doc.paths['/auth/refresh']?.post?.responses).toHaveProperty('401');
    expect(doc.paths['/auth/logout']?.post?.responses).toHaveProperty('204');
    expect(Object.keys(doc.paths).filter((path) => path.startsWith('/auth/'))).toEqual(
      expect.arrayContaining(['/auth/sessions', '/auth/sessions/{id}', '/auth/logout-all']),
    );
  });
});

describe('alertes de sécurité (D5)', () => {
  const NEW_DEVICE = 'Nouvelle connexion à votre compte OZ';
  const REUSE = 'Activité suspecte sur votre compte OZ';
  const SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const flush = () => harness.app.get(MailDispatcher).flush();
  const count = async (address: string, subject: string) =>
    (await harness.subjectsTo(address)).filter((s) => s === subject).length;

  it('appareil inconnu depuis 90 jours : un email ; même appareil ensuite : aucun', async () => {
    const address = await account();
    await login(address).expect(200);
    await flush();
    const body = await harness.mailTo(address, NEW_DEVICE);
    expect(body).toContain('Firefox · macOS');
    expect(body).not.toMatch(/Mozilla|127\.0\.0\.1|#token=/);
    await login(address).expect(200);
    await flush();
    expect(await count(address, NEW_DEVICE)).toBe(1);
    await request(server)
      .post('/auth/login')
      .set('User-Agent', SAFARI)
      .send({ email: address, password: PASSWORD })
      .expect(200);
    await flush();
    expect(await count(address, NEW_DEVICE)).toBe(2);
  });

  it('client sans User-Agent reconnu : un seul email, pas un par connexion', async () => {
    const address = await account();
    for (let i = 0; i < 2; i++) {
      await request(server)
        .post('/auth/login')
        .set('User-Agent', 'curl/8.7.1')
        .send({ email: address, password: PASSWORD })
        .expect(200);
    }
    await flush();
    expect(await harness.mailTo(address, NEW_DEVICE)).toContain('Appareil non identifié');
    expect(await count(address, NEW_DEVICE)).toBe(1);
  });

  it('réutilisation détectée : alerte au titulaire, sans jeton', async () => {
    const address = await account();
    const first = refreshCookie(await login(address).expect(200));
    await refresh(first).expect(200);
    await refresh(first).expect(401);
    await flush();
    const body = await harness.mailTo(address, REUSE);
    expect(body).not.toContain(first);
    expect(body).not.toMatch(/#token=|127\.0\.0\.1/);
    expect(await count(address, REUSE)).toBe(1);
  });

  it('jeton simplement invalide : aucune alerte', async () => {
    const address = await account();
    refreshCookie(await login(address).expect(200));
    await refresh('B'.repeat(43)).expect(401);
    await flush();
    expect(await count(address, REUSE)).toBe(0);
  });
});
