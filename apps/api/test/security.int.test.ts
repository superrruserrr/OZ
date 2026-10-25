import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { productionOverrides, testConfig } from './support.js';

const ALLOWED = 'http://localhost:3000';
const FOREIGN = 'https://site-tiers.example';
let app: NestExpressApplication;
let server: App;

beforeAll(async () => {
  app = await createApp(testConfig({ CORS_ORIGINS: ALLOWED }));
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
});

describe('en-têtes de sécurité §6.5 (EX-T17 n° 2)', () => {
  it.each(['/health', '/route-inexistante'])('posés sur %s', async (path) => {
    const response = await request(server).get(path);
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('assouplit la CSP uniquement pour /docs, sans autoriser l’intégration en cadre', async () => {
    const response = await request(server).get('/docs');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});

describe('CORS en liste blanche (EX-T17 n° 3)', () => {
  it('autorise une origine listée, avec les cookies', async () => {
    const response = await request(server).get('/health').set('Origin', ALLOWED);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('n’envoie aucun en-tête CORS à une origine non listée', async () => {
    const response = await request(server).get('/health').set('Origin', FOREIGN);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('pré-vol : accepté pour une origine listée, sans en-tête CORS pour une autre', async () => {
    const allowed = await request(server)
      .options('/health')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'GET');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED);
    const foreign = await request(server)
      .options('/health')
      .set('Origin', FOREIGN)
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    expect(foreign.headers['access-control-allow-methods']).toBeUndefined();
  });
});

describe('CSP assouplie limitée à /docs exactement (revue tour 1)', () => {
  it.each(['/docsx', '/docs-anything', '/documents', '/docs-json-autre'])(
    'garde la CSP stricte sur %s',
    async (path) => {
      const response = await request(server).get(path);
      expect(String(response.headers['content-security-policy'])).toContain("default-src 'none'");
    },
  );

  it('applique la CSP de /docs à ses sous-chemins', async () => {
    const response = await request(server).get('/docs/swagger-ui.css');
    expect(String(response.headers['content-security-policy'])).toContain("default-src 'self'");
  });

  it('garde la CSP stricte sur /docs en production (documentation non montée)', async () => {
    const prod = await createApp(testConfig(productionOverrides));
    await prod.init();
    try {
      const response = await request(prod.getHttpServer()).get('/docs');
      expect(String(response.headers['content-security-policy'])).toContain("default-src 'none'");
    } finally {
      await prod.close();
    }
  });
});

describe('Vary: Origin (revue tour 1)', () => {
  it.each([
    ['listée', ALLOWED],
    ['non listée', FOREIGN],
    ['absente', undefined],
  ])('présent quelle que soit l’origine (%s)', async (_, origin) => {
    const call = request(server).get('/health');
    const response = await (origin ? call.set('Origin', origin) : call);
    expect(String(response.headers.vary)).toMatch(/\bOrigin\b/);
  });
});
