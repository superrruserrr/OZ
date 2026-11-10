// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE,
  CHALLENGE_COOKIE,
  REFRESH_COOKIE,
  clearedSessionCookies,
  readAccessToken,
  refreshFromSetCookie,
  sessionCookies,
} from './cookies';

const REFRESH = 'A'.repeat(43);
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

/** JWT factice (signature non vérifiée par le site : seule l'API fait autorité). */
function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'EdDSA', typ: 'JWT' })}.${part(payload)}.c2lnbmF0dXJl`;
}

const STRICT = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' } as const;

describe('cookies de session du site (ADR-010)', () => {
  it('noms préfixés __Host-', () => {
    expect([ACCESS_COOKIE, REFRESH_COOKIE, CHALLENGE_COOKIE]).toEqual([
      '__Host-oz_access',
      '__Host-oz_refresh',
      '__Host-oz_2fa',
    ]);
  });

  it('pose l’accès (durée du jeton) et recopie le rafraîchissement de l’API', () => {
    const cookies = sessionCookies({ accessToken: 'jwt', expiresIn: 900 }, [
      `__Host-oz_refresh=${REFRESH}; Max-Age=2592000; Path=/; Expires=Thu, 10 Dec 2026 12:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
    ]);
    expect(cookies).toEqual([
      { name: ACCESS_COOKIE, value: 'jwt', options: { ...STRICT, maxAge: 900 } },
      { name: REFRESH_COOKIE, value: REFRESH, options: { ...STRICT, maxAge: 2_592_000 } },
    ]);
  });

  it('sans cookie de rafraîchissement valide de l’API, ou jeton trop long : aucune session', () => {
    expect(sessionCookies({ accessToken: 'jwt', expiresIn: 900 }, [])).toBeNull();
    expect(
      sessionCookies({ accessToken: 'jwt', expiresIn: 900 }, [
        '__Host-oz_refresh=<script>; Max-Age=60',
      ]),
    ).toBeNull();
    expect(
      sessionCookies({ accessToken: 'j'.repeat(4_000), expiresIn: 900 }, [
        `__Host-oz_refresh=${REFRESH}; Max-Age=60`,
      ]),
    ).toBeNull();
  });

  it('lit Max-Age, sinon Expires ; refuse une valeur malformée', () => {
    expect(refreshFromSetCookie([`__Host-oz_refresh=${REFRESH}; Max-Age=60`], NOW)).toEqual({
      value: REFRESH,
      maxAge: 60,
    });
    expect(
      refreshFromSetCookie(
        [`__Host-oz_refresh=${REFRESH}; Expires=Tue, 10 Nov 2026 12:10:00 GMT`],
        NOW,
      ),
    ).toEqual({ value: REFRESH, maxAge: 600 });
    expect(refreshFromSetCookie(['autre=1', `__Host-oz_refresh=${REFRESH}`], NOW)).toBeNull();
    expect(refreshFromSetCookie(['__Host-oz_refresh=; Max-Age=0'], NOW)).toBeNull();
  });

  it('efface les trois cookies avec les mêmes attributs (sinon __Host- refuse)', () => {
    expect(clearedSessionCookies()).toEqual(
      [ACCESS_COOKIE, REFRESH_COOKIE, CHALLENGE_COOKIE].map((name) => ({
        name,
        value: '',
        options: { ...STRICT, maxAge: 0 },
      })),
    );
  });

  it('lit l’échéance et le sujet du jeton d’accès', () => {
    const token = jwt({ sub: '0192f0c4-1111-7000-8000-000000000001', exp: NOW / 1000 + 300 });
    expect(readAccessToken(token)).toEqual({
      token,
      userId: '0192f0c4-1111-7000-8000-000000000001',
      expiresAt: NOW + 300_000,
    });
  });

  it.each([
    ['vide', ''],
    ['sans trois parties', 'a.b'],
    ['charge illisible', 'a.%%%.c'],
    ['sans exp', jwt({ sub: 'x' })],
    ['sans sub', jwt({ exp: 2_000_000_000 })],
    ['trop long', 'a'.repeat(5_000)],
  ])('jeton d’accès invalide (%s) → null', (_label, token) => {
    expect(readAccessToken(token)).toBeNull();
  });
});
