import { describe, expect, it } from 'vitest';
import {
  createNonce,
  isSecureRequest,
  resolveAppEnv,
  pageSecurityHeaders,
  staticSecurityHeaders,
} from './security-headers.js';

/** Directives CSP sous forme `nom → valeurs`. */
function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name = '', ...values]) => [name, values]),
  );
}

const nonce = 'AAECAwQFBgcICQoLDA0ODw=='; // 16 octets
const prod = { nonce, development: false, secureTransport: true };

describe('createNonce', () => {
  it('produit 128 bits aléatoires en base64, différents à chaque appel', () => {
    const values = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(values.size).toBe(50);
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(Buffer.from(value, 'base64')).toHaveLength(16);
    }
  });
});

describe('pageSecurityHeaders (plan §6.5, EX-T17.2)', () => {
  it('pose la CSP stricte avec nonce', () => {
    const csp = directives(pageSecurityHeaders(prod)['Content-Security-Policy'] ?? '');
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(csp.get('style-src')).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(csp.get('img-src')).toEqual(["'self'", 'data:']);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('n’autorise jamais unsafe-inline ni unsafe-eval en production', () => {
    expect(pageSecurityHeaders(prod)['Content-Security-Policy']).not.toMatch(
      /unsafe-(inline|eval)/,
    );
  });

  it('en développement seulement : eval pour React, styles inline pour l’overlay de Next', () => {
    const dev = directives(
      pageSecurityHeaders({ ...prod, development: true })['Content-Security-Policy'] ?? '',
    );
    expect(dev.get('script-src')).toEqual([
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'unsafe-eval'",
    ]);
    // Un nonce désactiverait 'unsafe-inline' : il est retiré de style-src en développement.
    expect(dev.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('émet HSTS et upgrade-insecure-requests seulement sur une connexion chiffrée', () => {
    expect(pageSecurityHeaders(prod)['Strict-Transport-Security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    const http = pageSecurityHeaders({ ...prod, secureTransport: false });
    expect(http['Strict-Transport-Security']).toBeUndefined();
    expect(http['Content-Security-Policy']).not.toMatch(/upgrade-insecure-requests/);
  });

  it('refuse un nonce qui pourrait casser la politique', () => {
    for (const bad of ['', 'abc', "x' 'unsafe-inline", 'a;b'.padEnd(24, 'c')]) {
      expect(() => pageSecurityHeaders({ ...prod, nonce: bad }), bad).toThrow();
    }
  });

  it('inclut les en-têtes communs', () => {
    expect(pageSecurityHeaders(prod)).toMatchObject(staticSecurityHeaders());
  });
});

describe('staticSecurityHeaders', () => {
  it('pose les en-têtes du §6.5 indépendants du nonce', () => {
    expect(staticSecurityHeaders()).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
      'X-Frame-Options': 'DENY',
    });
  });

  it('peut interdire l’indexation (back-office)', () => {
    expect(staticSecurityHeaders({ noIndex: true })['X-Robots-Tag']).toBe('noindex, nofollow');
  });
});

describe('isSecureRequest', () => {
  it('recette et production sont toujours servies en HTTPS (Cloudflare) : HSTS sans condition', () => {
    for (const appEnv of ['staging', 'production'] as const) {
      expect(isSecureRequest({ appEnv, protocol: 'http:', forwardedProto: null }), appEnv).toBe(
        true,
      );
    }
  });

  it('ailleurs, se fie au protocole reçu ou au premier x-forwarded-proto', () => {
    expect(isSecureRequest({ appEnv: 'local', protocol: 'http:', forwardedProto: null })).toBe(
      false,
    );
    expect(isSecureRequest({ appEnv: 'local', protocol: 'https:', forwardedProto: null })).toBe(
      true,
    );
    expect(
      isSecureRequest({ appEnv: 'preview', protocol: 'http:', forwardedProto: 'https, http' }),
    ).toBe(true);
    expect(isSecureRequest({ appEnv: 'local', protocol: 'http:', forwardedProto: 'http' })).toBe(
      false,
    );
  });
});

describe('resolveAppEnv (revue lot 0.4 : APP_ENV validé comme pour l’API)', () => {
  it('accepte les quatre environnements connus', () => {
    for (const env of ['local', 'preview', 'staging', 'production']) {
      expect(resolveAppEnv(env, 'production')).toBe(env);
    }
  });

  it('refuse une valeur inconnue plutôt que de désactiver HSTS en silence', () => {
    for (const env of ['prod', 'Production', 'staging ', '']) {
      expect(() => resolveAppEnv(env, 'production'), JSON.stringify(env)).toThrow(/APP_ENV/);
    }
  });

  it('exige APP_ENV pour un build de production ; vaut local en développement et en test', () => {
    expect(() => resolveAppEnv(undefined, 'production')).toThrow(/APP_ENV/);
    expect(resolveAppEnv(undefined, 'development')).toBe('local');
    expect(resolveAppEnv(undefined, 'test')).toBe('local');
  });
});
