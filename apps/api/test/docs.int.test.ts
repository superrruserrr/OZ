import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { productionOverrides, testConfig } from './support.js';

const apps: NestExpressApplication[] = [];
async function serverFor(appEnv: string): Promise<App> {
  const app = await createApp(
    testConfig(appEnv === 'production' ? productionOverrides : { APP_ENV: appEnv }),
  );
  await app.init();
  apps.push(app);
  return app.getHttpServer();
}
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

describe('/docs (EX-003 n° 4, EX-T07)', () => {
  it.each(['local', 'preview', 'staging'])('expose /docs et /docs-json en %s', async (appEnv) => {
    const server = await serverFor(appEnv);
    expect((await request(server).get('/docs')).status).toBeLessThan(400);
    expect((await request(server).get('/docs-json')).status).toBe(200);
  });

  it('n’expose pas /docs ni /docs-json en production', async () => {
    const server = await serverFor('production');
    expect((await request(server).get('/docs')).status).toBe(404);
    expect((await request(server).get('/docs-json')).status).toBe(404);
  });

  it('décrit /health en OpenAPI 3 : réponses 200 et 503, schéma d’erreur', async () => {
    const response = await request(await serverFor('local')).get('/docs-json');
    const doc = response.body as {
      openapi: string;
      paths: Record<
        string,
        { get?: { responses?: Record<string, unknown>; security?: unknown[] } }
      >;
      components?: { schemas?: Record<string, unknown> };
    };
    expect(doc.openapi).toMatch(/^3\./);
    const responses = doc.paths['/health']?.get?.responses ?? {};
    expect(Object.keys(responses).sort()).toEqual(['200', '503']);
    expect(Object.keys(doc.components?.schemas ?? {})).toContain('ApiErrorDto');
  });
});
