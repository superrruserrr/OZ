// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import proxy from './proxy';
import { safeNext } from './session/protected-routes';

const REFRESH = 'R'.repeat(43);
const ROTATED = 'S'.repeat(43);
const fetchMock = vi.fn<typeof fetch>();

function jwt(expSeconds: number): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'EdDSA' })}.${part({ sub: 'u-1', exp: expSeconds })}.c2ln`;
}
const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

async function call(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return proxy(
    new NextRequest(`http://localhost${path}`, {
      headers: {
        ...(cookie ? { cookie } : {}),
        'x-forwarded-for': '203.0.113.9',
        'user-agent': 'UA',
      },
    }),
  );
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.stubEnv('APP_URL', 'http://localhost');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('proxy : garde des écrans connectés (ADR-010)', () => {
  it('page publique : aucun appel à l’API, même avec des cookies', async () => {
    await call('/', { '__Host-oz_refresh': REFRESH });
    await call('/tarifs', {
      '__Host-oz_access': jwt(inSeconds(-10)),
      '__Host-oz_refresh': REFRESH,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sans session : 303 vers la connexion avec le chemin d’origine, en-têtes conservés', async () => {
    const response = await call('/onboarding/identite?etape=2');
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get('next')).toBe('/onboarding/identite?etape=2');
    expect(response.headers.get('content-security-policy')).toContain("'nonce-");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('garde aussi la version anglaise et y renvoie', async () => {
    const response = await call('/en/onboarding');
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/en/auth/login');
  });

  it('jeton d’accès valable : rendu sans appel', async () => {
    const response = await call('/onboarding', { '__Host-oz_access': jwt(inSeconds(600)) });
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('jeton proche de l’échéance : rotation, nouveaux cookies posés et vus par le rendu', async () => {
    const access = jwt(inSeconds(900));
    const reply = new Response(JSON.stringify({ accessToken: access, expiresIn: 900 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    reply.headers.append(
      'set-cookie',
      `__Host-oz_refresh=${ROTATED}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Strict`,
    );
    fetchMock.mockResolvedValue(reply);

    const response = await call('/onboarding', {
      '__Host-oz_access': jwt(inSeconds(30)),
      '__Host-oz_refresh': REFRESH,
      autre: '1',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).href).toBe('http://api.test/auth/refresh');
    const sent = new Headers(init?.headers);
    expect(sent.get('cookie')).toBe(`__Host-oz_refresh=${REFRESH}`);
    expect(sent.get('origin')).toBe('http://localhost');
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.9');

    expect(response.status).toBe(200);
    const cookies = setCookies(response);
    const accessCookie = (
      cookies.find((c) => c.startsWith('__Host-oz_access=')) ?? ''
    ).toLowerCase();
    for (const attribute of ['max-age=900', 'httponly', 'secure', 'samesite=strict', 'path=/']) {
      expect(accessCookie).toContain(attribute);
    }
    const refresh = cookies.find((c) => c.startsWith('__Host-oz_refresh=')) ?? '';
    expect(refresh).toContain(ROTATED);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=strict', 'Path=/']) {
      expect(refresh.toLowerCase()).toContain(attribute.toLowerCase());
    }
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toContain(`__Host-oz_access=${access}`);
    expect(forwarded).toContain(`__Host-oz_refresh=${ROTATED}`);
    expect(forwarded).toContain('autre=1');
    expect(forwarded).not.toContain(REFRESH);
  });

  it('rotation refusée (401) : cookies effacés, renvoi à la connexion', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'AUTH_UNAUTHENTICATED', message: 'x', requestId: 'r' }), {
        status: 401,
      }),
    );
    const response = await call('/onboarding', { '__Host-oz_refresh': REFRESH });
    expect(response.status).toBe(303);
    const cleared = setCookies(response);
    for (const name of ['__Host-oz_access', '__Host-oz_refresh', '__Host-oz_2fa']) {
      expect(cleared.find((c) => c.startsWith(`${name}=;`))).toMatch(/Max-Age=0/);
    }
  });

  it('panne de l’API : rien n’est effacé ; un jeton encore valable suffit', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const kept = await call('/onboarding', {
      '__Host-oz_access': jwt(inSeconds(30)),
      '__Host-oz_refresh': REFRESH,
    });
    expect(kept.status).toBe(200);
    expect(setCookies(kept)).toEqual([]);

    const expired = await call('/onboarding', { '__Host-oz_refresh': REFRESH });
    expect(expired.status).toBe(303);
    expect(setCookies(expired)).toEqual([]);
  });

  it('rotation faite sans cookie de rafraîchissement exploitable : session close, pas de rejeu', async () => {
    const error = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ accessToken: jwt(inSeconds(900)), expiresIn: 900 }), {
        status: 200,
      }),
    );
    const response = await call('/onboarding', { '__Host-oz_refresh': REFRESH });
    expect(response.status).toBe(303);
    expect(setCookies(response).find((c) => c.startsWith('__Host-oz_refresh=;'))).toMatch(
      /Max-Age=0/,
    );
    expect(String(error.mock.calls[0]?.[0])).not.toContain(REFRESH);
    error.mockRestore();
  });

  it('préchargement : jamais de rotation', async () => {
    const request = new NextRequest('http://localhost/onboarding', {
      headers: { cookie: `__Host-oz_refresh=${REFRESH}`, 'next-router-prefetch': '1' },
    });
    const response = await proxy(request);
    expect(response.status).toBe(303);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('cookie de rafraîchissement malformé : jamais transmis à l’API', async () => {
    const response = await call('/onboarding', { '__Host-oz_refresh': 'x;y' });
    expect(response.status).toBe(303);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('safeNext : pas de redirection ouverte', () => {
  it.each([
    ['/onboarding/identite?etape=2', '/onboarding/identite?etape=2'],
    ['/en/onboarding', '/en/onboarding'],
    [null, '/onboarding'],
    ['', '/onboarding'],
    ['https://evil.test/x', '/onboarding'],
    ['//evil.test/x', '/onboarding'],
    ['/\\evil.test', '/onboarding'],
    ['/%2F%2Fevil.test', '/%2F%2Fevil.test'],
    ['/ onboarding', '/onboarding'],
    ['javascript:alert(1)', '/onboarding'],
    ['/auth/login', '/onboarding'],
    ['/en/auth/signup/player', '/onboarding'],
    // Revue adversariale : la normalisation de `.`/`..` ne doit jamais produire `//hôte`.
    ['/.//evil.test', '/onboarding'],
    ['/..//evil.test', '/onboarding'],
    ['/a/..//evil.test', '/onboarding'],
    ['/%2e//evil.test', '/onboarding'],
    ['/%2E%2E//evil.test', '/onboarding'],
    ['/onboarding/./identite', '/onboarding'],
    [`/${'a'.repeat(600)}`, '/onboarding'],
  ])('%s → %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });
});
