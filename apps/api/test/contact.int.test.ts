import { Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sendContactMessageSchema, type SendContactMessageInput } from '@oz/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from '../src/authorization/decorators.js';
import { configureApp, createApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ValidatedBody } from '../src/common/validation/validated-body.decorator.js';
import { captureLogs, type LogCapture } from './log-capture.js';
import { testConfig } from './support.js';

const valid = {
  name: 'Éliot Moukoko',
  email: 'eliot@exemple.cm',
  organisationType: 'academy',
  message: 'Contenu confidentiel du message de contact : 12345.',
  consent: true,
};

let calls: SendContactMessageInput[] = [];

@Public()
@Controller('espion')
class SpyController {
  @Post()
  receive(@ValidatedBody(sendContactMessageSchema) input: SendContactMessageInput): { ok: true } {
    calls.push(input);
    return { ok: true };
  }
}

let enabled: NestExpressApplication;
let disabled: NestExpressApplication;
let server: App;
let logs: LogCapture;

beforeAll(async () => {
  logs = captureLogs();
  @Module({
    imports: [
      AppModule.forRoot(testConfig({ LOG_LEVEL: 'debug', FEATURE_CONTACT_FORM: 'true' }), {
        logStream: logs.stream,
      }),
    ],
    controllers: [SpyController],
  })
  class TestModule {}
  enabled = await NestFactory.create<NestExpressApplication>(TestModule, { bufferLogs: true });
  configureApp(enabled);
  await enabled.init();
  server = enabled.getHttpServer();
  disabled = await createApp(testConfig({ FEATURE_CONTACT_FORM: 'false' }));
  await disabled.init();
});
afterAll(async () => {
  await enabled.close();
  await disabled.close();
});

describe('validation C2 avant toute logique (CP-05, EX-T04)', () => {
  it('le gestionnaire n’est jamais appelé avec une entrée non conforme', async () => {
    calls = [];
    const response = await request(server)
      .post('/espion')
      .send({ ...valid, email: 'pas-un-email' });
    expect(response.status).toBe(422);
    expect(calls).toEqual([]);
  });

  it('le gestionnaire reçoit l’objet parsé, sans champ inconnu', async () => {
    calls = [];
    const refused = await request(server)
      .post('/espion')
      .send({ ...valid, isAdmin: true });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({
      details: [{ field: 'isAdmin', code: 'unrecognized_keys' }],
    });
    const accepted = await request(server)
      .post('/espion')
      .send({ ...valid, email: '  ELIOT@Exemple.CM ' });
    expect(accepted.status).toBe(201);
    expect(calls).toEqual([{ ...valid, email: 'eliot@exemple.cm' }]);
  });
});

describe('POST /contact', () => {
  it('202 avec un message valide', async () => {
    const response = await request(server).post('/contact').send(valid);
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: 'received' });
  });

  it('422 avec un email invalide, même en contournant le formulaire (C2)', async () => {
    const response = await request(server)
      .post('/contact')
      .send({ ...valid, email: 'eliot' });
    expect(response.status).toBe(422);
    expect(response.text).not.toContain('Contenu confidentiel');
  });

  it('n’écrit jamais le contenu du message ni l’email dans les logs', async () => {
    const response = await request(server).post('/contact').send(valid);
    const raw = await logs.waitFor(String(response.headers['x-request-id']));
    expect(raw).not.toContain('Contenu confidentiel');
    expect(raw).not.toContain('eliot@exemple.cm');
  });

  it('404 quand le drapeau FEATURE_CONTACT_FORM est désactivé', async () => {
    const response = await request(disabled.getHttpServer()).post('/contact').send(valid);
    expect(response.status).toBe(404);
  });

  it('documente /contact en OpenAPI 3.0 valide, généré depuis le contrat', async () => {
    const doc = (await request(server).get('/docs-json')).body as {
      paths: Record<
        string,
        {
          post?: {
            requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
            responses: Record<string, { content?: unknown }>;
          };
        }
      >;
    };
    const post = doc.paths['/contact']?.post;
    const body = post?.requestBody?.content['application/json']?.schema ?? {};
    const text = JSON.stringify(body);
    expect(text).not.toContain('$schema');
    expect(text).not.toContain('"const"');
    expect((body.properties as Record<string, { format?: string } | undefined>).email?.format).toBe(
      'email',
    );
    expect(Object.keys(post?.responses ?? {}).sort()).toEqual(['202', '400', '413', '422']);
    const props = body.properties as Record<string, Record<string, unknown> | undefined>;
    // Corps de requête (entrée) : les contraintes de longueur de l'entrée sont documentées.
    expect(props.email?.maxLength).toBe(254);
    // Pas de motif à propriétés Unicode (\\p{…}), non pris en charge par les validateurs OpenAPI 3.0.
    expect(text).not.toContain('\\p{');
    expect(typeof props.name?.description).toBe('string');
    expect(post?.responses['202']?.content).toBeDefined();
  });
});
