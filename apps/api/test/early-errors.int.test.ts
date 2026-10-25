// Erreurs levées avant les contrôleurs (analyse du corps, décodage d'URL) : même format, même requestId.
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { captureLogs, type LogCapture } from './log-capture.js';
import { testConfig } from './support.js';

let app: NestExpressApplication;
let server: App;
let logs: LogCapture;

beforeAll(async () => {
  logs = captureLogs();
  app = await createApp(testConfig({ LOG_LEVEL: 'info' }), { logStream: logs.stream });
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
});

function expectConsistentId(response: request.Response): string {
  const id = String(response.headers['x-request-id']);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  expect((response.body as { requestId: string }).requestId).toBe(id);
  return id;
}

describe('erreurs avant les contrôleurs (EX-003 n° 2, EX-T19)', () => {
  it('JSON malformé → 400 BAD_REQUEST avec un requestId cohérent', async () => {
    const response = await request(server)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"password":"hunter2",');
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('BAD_REQUEST');
    expectConsistentId(response);
  });

  it('corps trop volumineux → 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(server)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200_000) }));
    expect(response.status).toBe(413);
    expect((response.body as { code: string }).code).toBe('PAYLOAD_TOO_LARGE');
    expectConsistentId(response);
  });

  it('jeu de caractères inconnu → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const response = await request(server)
      .post('/health')
      .set('Content-Type', 'application/json; charset=foo')
      .send('{}');
    expect(response.status).toBe(415);
    expectConsistentId(response);
  });

  it('encodage de contenu invalide → 4xx, jamais 500', async () => {
    const response = await request(server)
      .post('/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('pas du gzip');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expectConsistentId(response);
  });

  it('erreur client journalisée au niveau info, avec son requestId, sans pile ni contenu du corps', async () => {
    const response = await request(server)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"password":"hunter2",');
    const id = expectConsistentId(response);
    const raw = await logs.waitFor(id);
    const lines = raw.split('\n').filter((line) => line.includes(id));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const entry = JSON.parse(line) as { level: number };
      expect(entry.level).toBeLessThan(50);
      expect(line).not.toMatch(/hunter2|"stack"/);
    }
  });
});
