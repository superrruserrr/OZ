// Une seule application par fichier : nestjs-pino garde son logger racine en statique (une instance
// par processus en production). Plusieurs applications dans le même fichier écriraient dans le flux
// de la première.
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
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

describe('requestId et logs JSON (EX-T19)', () => {
  it('renvoie un X-Request-Id et le retrouve dans le log JSON de la requête', async () => {
    const response = await request(server).get('/route-inexistante');
    const id = String(response.headers['x-request-id']);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await logs.waitFor(id);
    const entry = logs.lines().find((line) => (line.req as { id?: string } | undefined)?.id === id);
    expect(entry).toBeDefined();
  });

  it('conserve un X-Request-Id entrant valide et remplace un identifiant malformé', async () => {
    const kept = await request(server).get('/x').set('X-Request-Id', 'client-abc-12345');
    expect(kept.headers['x-request-id']).toBe('client-abc-12345');
    const replaced = await request(server).get('/x').set('X-Request-Id', 'abc;DROP');
    expect(replaced.headers['x-request-id']).not.toBe('abc;DROP');
  });

  it('n’écrit ni en-tête d’authentification, ni cookie, ni paramètre de requête, ni adresse IP', async () => {
    const response = await request(server)
      .get('/x?resetToken=jeton-secret-42')
      .set('Authorization', 'Bearer jeton-auth-99')
      .set('Cookie', 'refresh=cookie-secret-7');
    const raw = await logs.waitFor(String(response.headers['x-request-id']));
    expect(raw).toContain('"url":"/x"');
    for (const secret of [
      'jeton-secret-42',
      'jeton-auth-99',
      'cookie-secret-7',
      'remoteAddress',
      '127.0.0.1',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });
});
