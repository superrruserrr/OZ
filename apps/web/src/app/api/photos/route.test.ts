import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const signupFetch = vi.hoisted(() => vi.fn());
vi.mock('../../../onboarding/signup-api', () => ({ signupFetch }));

const ID = '0190a5f4-0000-7000-8000-000000000001';
const call = (query: string) => GET(new Request(`http://localhost/api/photos?${query}`));

describe('relais des photos (lot 1.19cd)', () => {
  beforeEach(() => {
    signupFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it('paramètres hors format : 404 sans appel de l’API', async () => {
    for (const query of [`joueur=me&id=x`, `joueur=../admin&id=${ID}`, `id=${ID}`]) {
      expect((await call(query)).status, query).toBe(404);
    }
    expect(signupFetch).not.toHaveBeenCalled();
  });

  it('refus de l’API : 404, rien de servi', async () => {
    signupFetch.mockResolvedValue({ ok: false, status: 404, code: 'NOT_FOUND', details: [] });
    const response = await call(`joueur=OZ-CM-26-7K4M9Q-M&id=${ID}`);
    expect(response.status).toBe(404);
    expect(signupFetch).toHaveBeenCalledWith(`/players/OZ-CM-26-7K4M9Q-M/photos/${ID}/url`, {
      method: 'GET',
    });
  });

  it('image saine : relayée depuis l’URL signée, cache privé, type image seulement', async () => {
    signupFetch.mockResolvedValue({
      ok: true,
      status: 200,
      setCookies: [],
      data: { url: 'http://s3.test/clean/x?sig=1', expiresAt: '2026-11-19T10:00:00.000Z' },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    const response = await call(`joueur=me&id=${ID}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    fetcher.mockResolvedValue(
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    );
    expect((await call(`joueur=me&id=${ID}`)).status).toBe(404);
  });
});
