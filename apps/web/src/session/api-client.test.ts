import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, assertApiConfig } from './api-client';

const fetchMock = vi.fn<typeof fetch>();

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test:3001');
  vi.stubEnv('APP_URL', 'https://oz.test');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('appelle API_URL avec le corps JSON, les en-têtes du client et un délai', async () => {
    fetchMock.mockResolvedValue(json(200, { formToken: 'x' }));
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: 'a@b.c' },
      client: { forwardedFor: '203.0.113.7', userAgent: 'Navigateur' },
    });

    expect(result).toEqual({ ok: true, status: 200, data: { formToken: 'x' }, setCookies: [] });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).href).toBe('http://api.test:3001/auth/login');
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"email":"a@b.c"}');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.cache).toBe('no-store');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('origin')).toBe('https://oz.test');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(headers.get('user-agent')).toBe('Navigateur');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
  });

  it('transmet le jeton d’accès et le seul cookie de rafraîchissement', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await apiFetch('/auth/logout', {
      method: 'POST',
      accessToken: 'jwt',
      refreshToken: 'r'.repeat(43),
    });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer jwt');
    expect(headers.get('cookie')).toBe(`__Host-oz_refresh=${'r'.repeat(43)}`);
  });

  it('rend les cookies posés par l’API', async () => {
    const response = json(200, { accessToken: 't', expiresIn: 900 });
    response.headers.append('set-cookie', '__Host-oz_refresh=abc; Max-Age=60; Path=/; HttpOnly');
    fetchMock.mockResolvedValue(response);
    const result = await apiFetch('/auth/refresh', { method: 'POST' });
    expect(result.ok && result.setCookies).toEqual([
      '__Host-oz_refresh=abc; Max-Age=60; Path=/; HttpOnly',
    ]);
  });

  it('rend 204 sans corps', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch('/auth/logout', { method: 'POST' })).toEqual({
      ok: true,
      status: 204,
      data: null,
      setCookies: [],
    });
  });

  it('rend le code, les détails et le délai d’une erreur, jamais le message', async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        {
          code: 'RATE_LIMITED',
          message: 'Trop de requêtes depuis 10.0.0.3',
          requestId: 'req',
          details: [{ field: 'email', code: 'required' }],
        },
        { 'retry-after': '120' },
      ),
    );
    const result = await apiFetch('/auth/register', { method: 'POST', body: {} });
    expect(result).toEqual({
      ok: false,
      status: 429,
      code: 'RATE_LIMITED',
      details: [{ field: 'email', code: 'required' }],
      retryAfterSeconds: 120,
    });
    expect(JSON.stringify(result)).not.toContain('10.0.0.3');
  });

  it('erreur au corps inattendu : code générique', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(await apiFetch('/auth/login', { method: 'POST' })).toEqual({
      ok: false,
      status: 502,
      code: 'UNAVAILABLE',
      details: [],
    });
  });

  it('panne réseau ou délai dépassé : UNAVAILABLE, sans exception', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED 10.0.0.2:3001'));
    expect(await apiFetch('/auth/login', { method: 'POST' })).toEqual({
      ok: false,
      status: 0,
      code: 'UNAVAILABLE',
      details: [],
    });
  });

  it('API_URL absente : UNAVAILABLE sans appel', async () => {
    vi.stubEnv('API_URL', '');
    expect((await apiFetch('/auth/login', { method: 'POST' })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse un chemin absolu vers un autre hôte', async () => {
    await expect(apiFetch('//evil.test/x', { method: 'GET' })).rejects.toThrow();
    await expect(apiFetch('https://evil.test/x', { method: 'GET' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('assertApiConfig (démarrage)', () => {
  it('exige API_URL et APP_URL valides en recette et en production', () => {
    vi.stubEnv('API_URL', '');
    expect(() => {
      assertApiConfig('production');
    }).toThrow(/API_URL/);
    expect(() => {
      assertApiConfig('staging');
    }).toThrow(/API_URL/);
    vi.stubEnv('API_URL', 'http://api:3001');
    vi.stubEnv('APP_URL', '');
    expect(() => {
      assertApiConfig('production');
    }).toThrow(/APP_URL/);
  });

  it('refuse une API_URL invalide, même en local', () => {
    vi.stubEnv('API_URL', 'pas une url');
    expect(() => {
      assertApiConfig('local');
    }).toThrow(/API_URL/);
  });

  it('tolère l’absence en local (site seul)', () => {
    vi.stubEnv('API_URL', '');
    vi.stubEnv('APP_URL', '');
    expect(() => {
      assertApiConfig('local');
    }).not.toThrow();
  });
});
