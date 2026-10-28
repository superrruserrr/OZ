import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { assertTrustedOrigin, readRefreshCookie, REFRESH_COOKIE } from './refresh-cookie.js';

const TOKEN = 'a'.repeat(43);
const withHeaders = (headers: Record<string, string>): Request =>
  ({
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    header: (name: string) => headers[name],
  }) as unknown as Request;

describe('readRefreshCookie', () => {
  it('lit le jeton parmi les autres cookies', () => {
    const req = withHeaders({ Cookie: `theme=dark; broken; ${REFRESH_COOKIE}=${TOKEN}` });
    expect(readRefreshCookie(req)).toBe(TOKEN);
  });

  it.each([
    ['absent', {}],
    ['autre cookie seulement', { Cookie: 'theme=dark' }],
    ['valeur mal formée', { Cookie: `${REFRESH_COOKIE}=pas-un-jeton` }],
    ['en-tête démesuré', { Cookie: `${REFRESH_COOKIE}=${TOKEN}; x=${'y'.repeat(8_200)}` }],
  ])('ignore un cookie %s', (_, headers) => {
    expect(readRefreshCookie(withHeaders(headers))).toBeNull();
  });
});

describe('assertTrustedOrigin', () => {
  const allowed = ['http://localhost:3000'];

  it('accepte une origine de la liste blanche', () => {
    expect(() => {
      assertTrustedOrigin(withHeaders({ Origin: 'http://localhost:3000' }), allowed);
    }).not.toThrow();
  });

  it.each([{}, { Origin: 'https://evil.example' }])('refuse %o', (headers) => {
    expect(() => {
      assertTrustedOrigin(withHeaders(headers), allowed);
    }).toThrow(expect.objectContaining({ code: 'AUTH_ORIGIN_REFUSED' }));
  });
});
