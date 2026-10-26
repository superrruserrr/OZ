// @vitest-environment node
import { unstable_doesMiddlewareMatch as matches } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy, { config } from './proxy';

const call = (url: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(url, { headers }));

const nonceOf = (csp: string | null): string | undefined => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];

describe('proxy web : nonce et en-têtes', () => {
  it('pose une CSP avec un nonce neuf à chaque requête', () => {
    const [first, second] = [call('http://localhost/'), call('http://localhost/')];
    const [a, b] = [first, second].map((r) => nonceOf(r.headers.get('content-security-policy')));
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('transmet le même nonce au rendu (en-tête de requête), pour les scripts de Next', () => {
    const response = call('http://localhost/en');
    const csp = response.headers.get('content-security-policy');
    // NextResponse.next({ request: { headers } }) expose les en-têtes réécrits ainsi :
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
  });

  it('garde la redirection de next-intl (/fr → /) avec les en-têtes de sécurité', () => {
    const response = call('http://localhost/fr');
    expect([307, 308]).toContain(response.status);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('émet HSTS derrière un proxy TLS (x-forwarded-proto), jamais en HTTP', () => {
    const tls = call('http://localhost/', { 'x-forwarded-proto': 'https' });
    expect(tls.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(call('http://localhost/').headers.get('strict-transport-security')).toBeNull();
  });

  it.each([
    ['/', true],
    ['/en', true],
    ['/en/foo.bar', true],
    ['/apiculture', true],
    ['/en/api', true],
    ['/api/x', false],
    ['/_next/static/chunks/app.js', false],
    ['/_next/image?url=%2Fa.png&w=64&q=75', false],
    ['/favicon.ico', false],
    ['/robots.txt', false],
  ] as const)('matcher : %s traité par le proxy → %s', (url, expected) => {
    expect(matches({ config, url })).toBe(expected);
  });
});
