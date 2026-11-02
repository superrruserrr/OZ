// Une seule application par fichier (voir logging.int.test.ts).
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from '../src/authorization/decorators.js';
import { configureApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AppException, InputValidationException } from '../src/common/errors/api-error.js';
import { captureLogs, type LogCapture } from './log-capture.js';
import { testConfig } from './support.js';

@Public()
@Controller('test-erreurs')
class ThrowingController {
  @Get('inattendue')
  unexpected(): never {
    throw new Error('ECONNREFUSED 10.0.0.3:5432 at /app/src/db.ts:12');
  }

  @Get('validation')
  validation(): never {
    const result = z.object({ email: z.email() }).safeParse({ email: 'pas-un-email-secret' });
    if (result.success) throw new Error('inatteignable');
    throw new InputValidationException(result.error);
  }

  @Get('zod-interne')
  internalZod(): never {
    z.object({ colonneInterne: z.number() }).parse({ colonneInterne: 'x' });
    throw new Error('inatteignable');
  }

  @Get('metier')
  business(): never {
    throw new AppException(409, 'OZ_ID_TAKEN', 'Identifiant déjà attribué.');
  }
}

let app: NestExpressApplication;
let server: App;
let logs: LogCapture;

beforeAll(async () => {
  logs = captureLogs();
  @Module({
    imports: [AppModule.forRoot(testConfig({ LOG_LEVEL: 'info' }), { logStream: logs.stream })],
    controllers: [ThrowingController],
  })
  class TestModule {}
  app = await NestFactory.create<NestExpressApplication>(TestModule, { bufferLogs: true });
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
});

describe('format d’erreur normalisé (EX-003 n° 2)', () => {
  it('route inconnue → 404 NOT_FOUND avec le requestId de l’en-tête', async () => {
    const response = await request(server).get('/inconnue');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String) as string,
      requestId: response.headers['x-request-id'] as string,
    });
  });

  it('erreur inattendue → 500 générique, sans pile ni détail interne, journalisée avec le même requestId', async () => {
    const response = await request(server).get('/test-erreurs/inattendue');
    expect(response.status).toBe(500);
    expect((response.body as { code: string }).code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.3|db\.ts|stack|at /);
    const requestId = String(response.headers['x-request-id']);
    expect((response.body as { requestId: string }).requestId).toBe(requestId);
    const raw = await logs.waitFor('ECONNREFUSED');
    const errorLine = raw.split('\n').find((line) => line.includes('ECONNREFUSED')) ?? '';
    expect(errorLine).toContain(requestId);
  });

  it('ZodError brute (code interne) → 500, sans nom de champ interne', async () => {
    const response = await request(server).get('/test-erreurs/zod-interne');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('colonneInterne');
  });

  it('InputValidationException → 422 VALIDATION_FAILED avec les champs, sans la valeur reçue', async () => {
    const response = await request(server).get('/test-erreurs/validation');
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'email' }],
    });
    expect(response.text).not.toContain('pas-un-email-secret');
  });

  it('AppException → son statut et son code', async () => {
    const response = await request(server).get('/test-erreurs/metier');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'OZ_ID_TAKEN',
      message: 'Identifiant déjà attribué.',
    });
  });
});
