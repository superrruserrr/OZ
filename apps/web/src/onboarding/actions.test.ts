// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    }),
  headers: () =>
    Promise.resolve(new Headers({ 'x-forwarded-for': '198.51.100.4', 'user-agent': 'Test' })),
}));

const { completeSignup, saveSignupStep } = await import('./actions');
const { readSignup } = await import('./signup-api');

const fetchMock = vi.fn<typeof fetch>();
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const ACCESS = `${encode({ alg: 'EdDSA' })}.${encode({
  sub: 'user-1',
  exp: Math.floor(Date.now() / 1000) + 600,
})}.signature`;

const IDENTITY = {
  firstName: 'Awa',
  lastName: 'Diallo',
  birthDate: '2000-04-12',
  nationality: 'SN',
  country: 'SN',
};
const STATUS = {
  steps: { identity: IDENTITY, sport: null, affiliation: null, guardian: null },
  minor: false,
  missing: ['sport', 'affiliation'],
  expiresAt: '2026-12-10T10:00:00.000Z',
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
const apiError = (code: string, details?: unknown) => ({
  code,
  message: 'interne',
  requestId: 'r',
  details,
});
const sent = (index = 0) => fetchMock.mock.calls[index];

beforeEach(() => {
  jar.clear();
  jar.set('__Host-oz_access', ACCESS);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.stubEnv('APP_URL', 'https://oz.test');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('lecture du brouillon (EX-107 n° 2)', () => {
  it('relaie le jeton du cookie et valide la réponse', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, STATUS));
    await expect(readSignup()).resolves.toEqual({ kind: 'draft', status: STATUS });
    const [url, init] = sent() ?? [];
    expect((url as URL).href).toBe('http://api.test/players/signup');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${ACCESS}`);
  });

  it('distingue inscription finalisée, session refusée et panne', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, apiError('SIGNUP_ALREADY_COMPLETED')));
    await expect(readSignup()).resolves.toEqual({ kind: 'completed' });
    fetchMock.mockResolvedValueOnce(reply(401, apiError('AUTH_UNAUTHENTICATED')));
    await expect(readSignup()).resolves.toEqual({ kind: 'unauthenticated' });
    fetchMock.mockResolvedValueOnce(reply(403, apiError('SIGNUP_REFUSED')));
    await expect(readSignup()).resolves.toEqual({ kind: 'refused' });
    fetchMock.mockResolvedValueOnce(reply(503, apiError('UNAVAILABLE')));
    await expect(readSignup()).resolves.toEqual({ kind: 'unavailable' });
    fetchMock.mockResolvedValueOnce(reply(200, { steps: {} }));
    await expect(readSignup()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('n’appelle pas l’API sans jeton d’accès lisible', async () => {
    jar.set('__Host-oz_access', 'pas-un-jeton');
    await expect(readSignup()).resolves.toEqual({ kind: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('enregistrement d’une étape', () => {
  it('valide l’étape avant l’API puis renvoie l’étape suivante', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, STATUS));
    await expect(saveSignupStep('identity', IDENTITY)).resolves.toEqual({
      ok: true,
      next: '/onboarding/physique',
    });
    const [url, init] = sent() ?? [];
    expect((url as URL).href).toBe('http://api.test/players/signup/identity');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual(IDENTITY);
  });

  it('refuse une étape inconnue ou un corps invalide sans appeler l’API', async () => {
    await expect(saveSignupStep('photo', {})).resolves.toMatchObject({
      ok: false,
      error: 'invalid',
    });
    await expect(
      saveSignupStep('sport', { primaryPosition: 'striker', secondaryPosition: 'striker' }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'invalid',
      fields: { dominantFoot: expect.any(String) as string },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('traduit les erreurs de l’API sans jamais rendre de jeton', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(422, apiError('VALIDATION_FAILED', [{ field: 'birthDate', code: 'required' }])),
    );
    const invalid = await saveSignupStep('identity', IDENTITY);
    expect(invalid).toEqual({ ok: false, error: 'invalid', fields: { birthDate: 'required' } });
    expect(JSON.stringify(invalid)).not.toContain(ACCESS);

    fetchMock.mockResolvedValueOnce(reply(401, apiError('AUTH_UNAUTHENTICATED')));
    await expect(saveSignupStep('identity', IDENTITY)).resolves.toMatchObject({ error: 'session' });
    fetchMock.mockResolvedValueOnce(reply(409, apiError('SIGNUP_ALREADY_COMPLETED')));
    await expect(saveSignupStep('identity', IDENTITY)).resolves.toMatchObject({
      error: 'completed',
    });
    const limited = reply(429, apiError('RATE_LIMITED'));
    limited.headers.set('retry-after', '30');
    fetchMock.mockResolvedValueOnce(limited);
    await expect(saveSignupStep('identity', IDENTITY)).resolves.toMatchObject({
      error: 'retryLater',
      retryAfterSeconds: 30,
    });
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(saveSignupStep('identity', IDENTITY)).resolves.toMatchObject({
      error: 'unavailable',
    });
  });
});

describe('finalisation (EX-120)', () => {
  const DONE = {
    ozId: 'OZ-SN-26-7K4M9Q-3',
    verificationStatus: 'declared',
    minor: false,
    completeness: 60,
  };

  it('rend l’OZ ID émis par l’API', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, DONE));
    await expect(completeSignup()).resolves.toEqual({ ok: true, card: DONE });
    const [url, init] = sent() ?? [];
    expect((url as URL).href).toBe('http://api.test/players/signup/complete');
    expect(init?.method).toBe('POST');
  });

  it('signale un tuteur manquant ou des étapes incomplètes', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(422, apiError('SIGNUP_GUARDIAN_REQUIRED', [{ field: 'guardian', code: 'required' }])),
    );
    await expect(completeSignup()).resolves.toMatchObject({ error: 'guardianRequired' });
    fetchMock.mockResolvedValueOnce(
      reply(422, apiError('SIGNUP_INCOMPLETE', [{ field: 'sport', code: 'required' }])),
    );
    await expect(completeSignup()).resolves.toMatchObject({ error: 'incomplete' });
    fetchMock.mockResolvedValueOnce(reply(201, { ...DONE, ozId: 'pas-un-oz-id' }));
    await expect(completeSignup()).resolves.toMatchObject({ error: 'unavailable' });
  });
});
