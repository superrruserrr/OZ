// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy from './proxy';

const call = (url: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(url, { headers }));
const nonceOf = (csp: string | null): string | undefined => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];

describe('proxy admin', () => {
  it('pose la même CSP avec nonce que le web, transmise au rendu', () => {
    const response = call('http://localhost/');
    const csp = response.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
    expect(nonceOf(call('http://localhost/').headers.get('content-security-policy'))).not.toBe(
      nonceOf(csp),
    );
  });

  it('interdit l’indexation', () => {
    expect(call('http://localhost/').headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('émet HSTS derrière un proxy TLS seulement', () => {
    const tls = call('http://localhost/', { 'x-forwarded-proto': 'https' });
    expect(tls.headers.get('strict-transport-security')).toContain('preload');
    expect(call('http://localhost/').headers.get('strict-transport-security')).toBeNull();
  });
});
