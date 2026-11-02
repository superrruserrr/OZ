import { Controller, Get, Param, Res, StreamableFile, type ExecutionContext } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { getLoggerToken, type PinoLogger } from 'nestjs-pino';
import { lastValueFrom, of } from 'rxjs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter.js';
import { forbiddenKey, PayloadGuardInterceptor } from './payload-guard.interceptor.js';

// Filet global (lot 1.4b, D7) : une réponse portant une clé sensible n'est jamais envoyée.

const PHONE = '+237650000001';

const BODIES: Record<string, unknown> = {
  propre: { id: 'p1', phone: PHONE, items: [{ city: 'Douala' }], at: new Date(0) },
  chiffre: { id: 'p1', profile: { phoneEncrypted: PHONE } },
  tableau: [{ id: 'a' }, { id: 'b', document_number_hmac: PHONE }],
  binaire: { id: 'p1', blob: Buffer.from(PHONE) },
  serialise: { id: 'p1', toJSON: () => ({ id: 'p1', passwordHash: PHONE }) },
};

@Controller('charge')
class PayloadController {
  @Get('texte')
  text(): string {
    return 'ok';
  }

  @Get('vide')
  empty(): void {
    return undefined;
  }

  @Get('fichier')
  file(): StreamableFile {
    return new StreamableFile(Buffer.from('%PDF-1.7'), { type: 'application/pdf' });
  }

  @Get('cookie')
  cookie(@Res({ passthrough: true }) res: Response): unknown {
    res.cookie('oz_test', 'valeur');
    return { id: 'p1', totpSecret: PHONE };
  }

  @Get(':name')
  body(@Param('name') name: string): unknown {
    return BODIES[name];
  }
}

const error = vi.fn();
const silent = { info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

let app: NestExpressApplication;
let server: App;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [PayloadController],
    providers: [
      { provide: APP_INTERCEPTOR, useClass: PayloadGuardInterceptor },
      { provide: getLoggerToken(PayloadGuardInterceptor.name), useValue: { error } },
    ],
  }).compile();
  app = module.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter(silent));
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe('PayloadGuardInterceptor', () => {
  it('une réponse propre passe inchangée', async () => {
    const response = await request(server).get('/charge/propre').expect(200);
    expect(response.body).toEqual({
      id: 'p1',
      phone: PHONE,
      items: [{ city: 'Douala' }],
      at: new Date(0).toISOString(),
    });
    await request(server).get('/charge/texte').expect(200, 'ok');
    await request(server).get('/charge/vide').expect(200);
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ['chiffre', 'phoneEncrypted'],
    ['tableau', 'document_number_hmac'],
    ['binaire', 'blob'],
    ['serialise', 'passwordHash'],
  ])('clé sensible (%s) : 500 sans le corps, journal sans valeur', async (name, key) => {
    const response = await request(server).get(`/charge/${name}`).expect(500);
    expect((response.body as { code: string }).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(PHONE);
    expect(JSON.stringify(response.body)).not.toContain(key);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toEqual({ method: 'GET', route: '/charge/:name', key });
    expect(JSON.stringify(error.mock.calls)).not.toContain(PHONE);
  });
});

describe('PayloadGuardInterceptor, cas particuliers', () => {
  it('un fichier en flux (StreamableFile) passe, binaire compris', async () => {
    const response = await request(server).get('/charge/fichier').expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(error).not.toHaveBeenCalled();
  });

  it('une réponse bloquée ne pose aucun cookie', async () => {
    const response = await request(server).get('/charge/cookie').expect(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('PayloadGuardInterceptor, en-têtes déjà envoyés', () => {
  it('bloque et journalise sans tenter de retirer les cookies', async () => {
    const logged = vi.fn();
    const logger = { error: logged } as unknown as PinoLogger;
    const removeHeader = vi.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/flux' } }),
        getResponse: () => ({ headersSent: true, removeHeader }),
      }),
    } as unknown as ExecutionContext;
    const result = new PayloadGuardInterceptor(logger).intercept(context, {
      handle: () => of({ phoneEncrypted: 'x' }),
    });
    await expect(lastValueFrom(result)).rejects.toThrow(/champ sensible/);
    expect(removeHeader).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledOnce();
  });
});

describe('forbiddenKey', () => {
  it.each([
    'phoneEncrypted',
    'documentNumberHmac',
    'phone_encrypted',
    'email_hmac',
    'passwordHash',
    'password_hash',
    'password',
    'totpSecret',
    'totp_secret_encrypted',
    'PHONEENCRYPTED',
    'documentNumber',
    'document_number',
    'issuerEncrypted',
    'hashHmac',
    'tokenHash',
    'refresh_token_hash',
    'codeHash',
    'storageKey',
    'storage_key',
  ])('refuse %s', (key) => {
    expect(forbiddenKey({ nested: [{ [key]: null }] })).toBe(key);
  });

  it.each([
    'phone',
    'email',
    'encryptedAt',
    'passwordChangedAt',
    'totpEnabled',
    'hmacVersion',
    'isEncrypted',
    'hasHmac',
    'is_encrypted',
    'hashAlgorithm',
    'documentNumberVerified',
  ])('laisse passer %s', (key) => {
    expect(forbiddenKey({ [key]: 'x' })).toBeNull();
  });

  it('refuse toute valeur binaire et ignore les valeurs simples', () => {
    expect(forbiddenKey([new Uint8Array([1])])).toBe('[]');
    for (const value of [null, undefined, 'texte', 42, true, new Date(0)]) {
      expect(forbiddenKey(value)).toBeNull();
    }
  });

  it('toJSON qui rend l’objet lui-même : ses clés sont lues', () => {
    expect(
      forbiddenKey({
        a: {
          phoneHmac: 'x',
          toJSON() {
            return this;
          },
        },
      }),
    ).toBe('phoneHmac');
  });

  it('toJSON qui rend un nouvel objet porteur de toJSON : appliqué une seule fois, sans boucle', () => {
    const value = {
      ok: 1,
      toJSON(): object {
        return { ...this };
      },
    };
    expect(forbiddenKey(value)).toBeNull();
    expect(JSON.parse(JSON.stringify(value))).toEqual({ ok: 1 });
  });

  it('suit toJSON comme JSON.stringify, sauf pour une date', () => {
    const hidden = { toJSON: () => ({ nested: { phoneEncrypted: 'x' } }) };
    expect(forbiddenKey({ items: [hidden] })).toBe('phoneEncrypted');
    expect(forbiddenKey({ toJSON: () => 'texte' })).toBeNull();
  });

  it('ne boucle pas sur une référence circulaire', () => {
    const loop: Record<string, unknown> = { id: 'a' };
    loop.self = loop;
    expect(forbiddenKey(loop)).toBeNull();
  });

  it('coût mesuré : 1 000 éléments de 18 champs en moins de 50 ms', () => {
    const items = Array.from({ length: 1_000 }, (_, index) =>
      Object.fromEntries(
        Array.from({ length: 18 }, (__, field) => [`champ${String(field)}`, index]),
      ),
    );
    const start = performance.now();
    expect(forbiddenKey({ items })).toBeNull();
    // Mesuré à ~3 ms sur un poste de développement ; la borne absorbe un runner lent.
    expect(performance.now() - start).toBeLessThan(50);
  });
});
