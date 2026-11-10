// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)?.value } : undefined),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        jar.set(name, { value, options });
      },
    }),
  headers: () =>
    Promise.resolve(new Headers({ 'x-forwarded-for': '198.51.100.4', 'user-agent': 'Test' })),
}));

const { login, loginTwoFactor, logout, openSignupForm, registerAccount, verifyEmail } =
  await import('./actions');

const fetchMock = vi.fn<typeof fetch>();
const REFRESH = 'Q'.repeat(43);
const CHALLENGE = 'c'.repeat(43);
const FORM = `${'a'.repeat(32)}.${'b'.repeat(43)}`;
const PASSWORD = 'Terrain-de-foot-2026!';

function reply(status: number, body: unknown, setCookie?: string): Response {
  const response = new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
}

const apiError = (code: string, details?: unknown) => ({
  code,
  message: 'interne',
  requestId: 'r',
  details,
});

beforeEach(() => {
  jar.clear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.stubEnv('APP_URL', 'https://oz.test');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sentBody = (index = 0): unknown =>
  JSON.parse(fetchMock.mock.calls[index]?.[1]?.body as string);
const sentHeaders = (index = 0) => new Headers(fetchMock.mock.calls[index]?.[1]?.headers);

describe('inscription', () => {
  it('jeton de formulaire demandé côté serveur', async () => {
    fetchMock.mockResolvedValue(reply(200, { formToken: FORM }));
    await expect(openSignupForm()).resolves.toBe(FORM);
    fetchMock.mockResolvedValue(reply(503, null));
    await expect(openSignupForm()).resolves.toBeNull();
  });

  it('revalide (C2) sans appeler l’API si l’entrée est invalide', async () => {
    const result = await registerAccount({ email: 'pas-un-email', password: 'x', formToken: 'y' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fields.email).toMatch(/^validation\./);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transmet au client l’adresse et le navigateur, rend un succès neutre', async () => {
    fetchMock.mockResolvedValue(reply(202, { status: 'accepted' }));
    const input = { email: 'joueur@exemple.test', password: PASSWORD, formToken: FORM };
    const result = await registerAccount(input);
    expect(result).toEqual({ ok: true });
    expect(sentBody()).toEqual(input);
    expect(sentHeaders().get('x-forwarded-for')).toBe('198.51.100.4');
  });

  it('mot de passe compromis et limite de débit : clé de message, délai, jamais le message de l’API', async () => {
    const input = { email: 'joueur@exemple.test', password: PASSWORD, formToken: FORM };
    fetchMock.mockResolvedValue(
      reply(
        422,
        apiError('AUTH_PASSWORD_BREACHED', [{ field: 'password', code: 'AUTH_PASSWORD_BREACHED' }]),
      ),
    );
    expect(await registerAccount(input)).toEqual({
      ok: false,
      error: 'passwordBreached',
      fields: { password: 'AUTH_PASSWORD_BREACHED' },
    });
    const limited = reply(429, apiError('RATE_LIMITED'));
    limited.headers.set('retry-after', '90');
    fetchMock.mockResolvedValue(limited);
    const result = await registerAccount(input);
    expect(result).toMatchObject({ ok: false, error: 'retryLater', retryAfterSeconds: 90 });
    expect(JSON.stringify(result)).not.toContain('interne');
  });
});

describe('confirmation d’email', () => {
  it('jeton malformé : refus sans appel', async () => {
    await expect(verifyEmail('abc')).resolves.toMatchObject({ ok: false, error: 'linkInvalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('jeton refusé par l’API : lien invalide ; accepté : succès', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, apiError('AUTH_TOKEN_INVALID')));
    await expect(verifyEmail(CHALLENGE)).resolves.toMatchObject({ error: 'linkInvalid' });
    fetchMock.mockResolvedValueOnce(reply(200, { status: 'verified' }));
    await expect(verifyEmail(CHALLENGE)).resolves.toEqual({ ok: true });
    expect(sentBody(1)).toEqual({ token: CHALLENGE });
  });
});

describe('connexion', () => {
  const credentials = { email: 'joueur@exemple.test', password: PASSWORD };

  it('pose les cookies HttpOnly et rend une destination interne', async () => {
    fetchMock.mockResolvedValue(
      reply(
        200,
        { accessToken: 'jwt', expiresIn: 900 },
        `__Host-oz_refresh=${REFRESH}; Max-Age=600; Path=/`,
      ),
    );
    const result = await login(credentials, 'https://evil.test/');
    expect(result).toEqual({ ok: true, next: '/onboarding' });
    expect(jar.get('__Host-oz_access')).toEqual({
      value: 'jwt',
      options: { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 900 },
    });
    expect(jar.get('__Host-oz_refresh')?.value).toBe(REFRESH);
    expect(jar.get('__Host-oz_2fa')?.options?.maxAge).toBe(0);
    expect(JSON.stringify(result)).not.toContain('jwt');
  });

  it('identifiants faux et compte inconnu : même message', async () => {
    fetchMock.mockResolvedValue(reply(401, apiError('AUTH_INVALID_CREDENTIALS')));
    await expect(login(credentials, null)).resolves.toMatchObject({ error: 'invalidCredentials' });
    expect(jar.size).toBe(0);
  });

  it('email non confirmé : message dédié', async () => {
    fetchMock.mockResolvedValue(reply(403, apiError('AUTH_EMAIL_UNVERIFIED')));
    await expect(login(credentials, null)).resolves.toMatchObject({ error: 'emailUnverified' });
  });

  it('API injoignable : indisponible, aucun cookie', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(login(credentials, null)).resolves.toMatchObject({ error: 'unavailable' });
    expect(jar.size).toBe(0);
  });

  it('second facteur : défi en cookie HttpOnly, jamais rendu au navigateur', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { status: '2fa_required', challengeToken: CHALLENGE, expiresIn: 300 }),
    );
    const result = await login(credentials, '/onboarding/identite');
    expect(result).toEqual({ ok: true, twoFactor: true });
    expect(jar.get('__Host-oz_2fa')).toEqual({
      value: CHALLENGE,
      options: { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 300 },
    });
    expect(jar.has('__Host-oz_access')).toBe(false);

    fetchMock.mockResolvedValue(
      reply(
        200,
        { accessToken: 'jwt2', expiresIn: 900 },
        `__Host-oz_refresh=${REFRESH}; Max-Age=600`,
      ),
    );
    await expect(loginTwoFactor('123456', '/onboarding/identite')).resolves.toEqual({
      ok: true,
      next: '/onboarding/identite',
    });
    expect(sentBody(1)).toEqual({ challengeToken: CHALLENGE, code: '123456' });
    expect(jar.get('__Host-oz_2fa')?.value).toBe('');
    expect(jar.get('__Host-oz_access')?.value).toBe('jwt2');
  });

  it('second facteur sans défi ou code faux : code invalide', async () => {
    await expect(loginTwoFactor('123456', null)).resolves.toMatchObject({ error: 'codeInvalid' });
    expect(fetchMock).not.toHaveBeenCalled();
    jar.set('__Host-oz_2fa', { value: CHALLENGE });
    fetchMock.mockResolvedValue(reply(401, apiError('AUTH_INVALID_CREDENTIALS')));
    await expect(loginTwoFactor('654321', null)).resolves.toMatchObject({ error: 'codeInvalid' });
  });
});

describe('déconnexion', () => {
  it('révoque côté API avec le cookie et l’origine, puis efface tout', async () => {
    jar.set('__Host-oz_refresh', { value: REFRESH });
    jar.set('__Host-oz_access', { value: 'jwt' });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logout()).resolves.toEqual({ ok: true });
    expect((fetchMock.mock.calls[0]?.[0] as URL).href).toBe('http://api.test/auth/logout');
    expect(sentHeaders().get('cookie')).toBe(`__Host-oz_refresh=${REFRESH}`);
    expect(sentHeaders().get('origin')).toBe('https://oz.test');
    for (const name of ['__Host-oz_access', '__Host-oz_refresh', '__Host-oz_2fa']) {
      expect(jar.get(name)?.options?.maxAge).toBe(0);
    }
  });

  it('API injoignable : cookies effacés quand même', async () => {
    jar.set('__Host-oz_refresh', { value: REFRESH });
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await logout();
    expect(jar.get('__Host-oz_refresh')?.value).toBe('');
  });
});
