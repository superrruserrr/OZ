import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { startServices, type TestServices } from './containers.js';
import { startProxy } from './tcp-proxy.js';
import { testConfig } from './support.js';

let services: TestServices;
const apps: NestExpressApplication[] = [];

async function serverWith(overrides: Record<string, string>): Promise<App> {
  const app = await createApp(testConfig(overrides));
  await app.init();
  apps.push(app);
  return app.getHttpServer();
}

beforeAll(async () => {
  services = await startServices();
});
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await services.stop();
});

describe('GET /health/live (vivacité, lot 0.8a)', () => {
  it('200 même quand la base, Redis et le stockage sont injoignables', async () => {
    const response = await request(
      await serverWith({
        ...services.env,
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none',
        REDIS_URL: 'redis://127.0.0.1:1',
        S3_ENDPOINT: 'http://127.0.0.1:1',
      }),
    ).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /health (EX-003 n° 3)', () => {
  it('200 ok quand PostgreSQL, Redis et le stockage répondent', async () => {
    const response = await request(await serverWith(services.env)).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up', storage: 'up' },
    });
  });

  it('503 degraded quand une dépendance est arrêtée, sans détail interne', async () => {
    const response = await request(
      await serverWith({ ...services.env, REDIS_URL: 'redis://127.0.0.1:1' }),
    ).get('/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'degraded',
      checks: { database: 'up', redis: 'down', storage: 'up' },
    });
    expect(response.text).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|Error|stack/);
  });

  it('marque down une dépendance qui ne répond pas, en 2 s au plus', async () => {
    const started = Date.now();
    const response = await request(
      // Adresse non routable : la connexion ne répond jamais.
      await serverWith({
        ...services.env,
        DATABASE_URL: 'postgresql://oz:oz@10.255.255.1:5432/oz',
      }),
    ).get('/health');
    const elapsed = Date.now() - started;
    expect(response.status).toBe(503);
    expect((response.body as { checks: { database: string } }).checks.database).toBe('down');
    expect(elapsed).toBeLessThan(3_000);
  });

  it('utilise TLS épinglé dès que les certificats sont fournis (D-006)', async () => {
    // Les services de test parlent en clair : avec un certificat, la poignée de main TLS échoue.
    // La preuve que les sondes tentent bien TLS au lieu d'ignorer le certificat.
    const ca = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
    const redisUrl = services.env.REDIS_URL?.replace(/^redis:/, 'rediss:') ?? '';
    const response = await request(
      await serverWith({
        ...services.env,
        REDIS_URL: redisUrl,
        DATABASE_CA_CERT: ca,
        REDIS_CA_CERT: ca,
      }),
    ).get('/health');
    expect(response.body).toEqual({
      status: 'degraded',
      checks: { database: 'down', redis: 'down', storage: 'up' },
    });
  });

  it('ne met pas l’état de santé en cache', async () => {
    const response = await request(await serverWith(services.env)).get('/health');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('5 appels simultanés : aucun faux « down »', async () => {
    const server = await serverWith(services.env);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(server).get('/health')),
    );
    for (const response of responses) {
      expect(response.body).toEqual({
        status: 'ok',
        checks: { database: 'up', redis: 'up', storage: 'up' },
      });
    }
  });

  it('revient à « up » après un gel réseau de PostgreSQL et Redis, et s’arrête sans bloquer', async () => {
    const db = new URL(services.env.DATABASE_URL ?? '');
    const cache = new URL(services.env.REDIS_URL ?? '');
    const dbProxy = await startProxy(db.hostname, Number(db.port));
    const cacheProxy = await startProxy(cache.hostname, Number(cache.port));
    db.hostname = '127.0.0.1';
    db.port = String(dbProxy.port);
    cache.hostname = '127.0.0.1';
    cache.port = String(cacheProxy.port);
    const app = await createApp(
      testConfig({ ...services.env, DATABASE_URL: db.toString(), REDIS_URL: cache.toString() }),
    );
    await app.init();
    const server = app.getHttpServer();
    // Laisse expirer le cache de santé entre deux mesures.
    const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2_100));
    try {
      expect((await request(server).get('/health')).status).toBe(200);

      dbProxy.stall();
      cacheProxy.stall();
      await pause();
      const started = Date.now();
      const stalled = await request(server).get('/health');
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(stalled.body).toMatchObject({
        checks: { database: 'down', redis: 'down', storage: 'up' },
      });

      dbProxy.resume();
      cacheProxy.resume();
      await pause();
      const recovered = await request(server).get('/health');
      expect(recovered.body).toEqual({
        status: 'ok',
        checks: { database: 'up', redis: 'up', storage: 'up' },
      });

      dbProxy.stall();
      cacheProxy.stall();
      await pause();
      await request(server).get('/health');
      const closing = Date.now();
      await app.close();
      expect(Date.now() - closing).toBeLessThan(3_000);
    } finally {
      await dbProxy.close();
      await cacheProxy.close();
    }
  });
});
