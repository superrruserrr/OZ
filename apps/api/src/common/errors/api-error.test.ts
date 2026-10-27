import { HttpException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AppException, InputValidationException, toApiError } from './api-error.js';

const RID = 'req-12345678';

describe('toApiError (EX-003 n° 2, EX-T07 n° 2)', () => {
  it('convertit une HttpException en code stable, sans reprendre son message interne', () => {
    const { status, body } = toApiError(new NotFoundException('Cannot GET /interne/chemin'), RID);
    expect(status).toBe(404);
    expect(body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String) as string,
      requestId: RID,
    });
    expect(body.message).not.toContain('/interne/chemin');
  });

  it('donne un code générique aux statuts HTTP sans code dédié', () => {
    expect(toApiError(new HttpException('x', 418), RID).body.code).toBe('HTTP_418');
  });

  it('transmet le code et le message choisis par une AppException', () => {
    const { status, body } = toApiError(
      new AppException(409, 'OZ_ID_TAKEN', 'Identifiant déjà attribué.'),
      RID,
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      code: 'OZ_ID_TAKEN',
      message: 'Identifiant déjà attribué.',
      requestId: RID,
    });
  });

  it('convertit une erreur de validation d’entrée en 422 avec les champs, sans les valeurs reçues', () => {
    const result = z
      .object({ birthDate: z.iso.date(), name: z.string().min(2) })
      .safeParse({ birthDate: 'secret-1', name: 'x' });
    if (result.success) throw new Error('le schéma aurait dû échouer');
    const { status, body } = toApiError(new InputValidationException(result.error), RID);
    expect(status).toBe(422);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details?.map((d) => d.field).sort()).toEqual(['birthDate', 'name']);
    expect(JSON.stringify(body)).not.toContain('secret-1');
  });

  it('reprend le code métier qu’un contrat attache à une règle, sinon le code Zod', () => {
    const schema = z.object({
      metier: z.string().superRefine((_, ctx) => {
        ctx.addIssue({
          code: 'custom',
          message: 'cle.i18n',
          params: { code: 'AUTH_PASSWORD_TOO_SHORT' },
        });
      }),
      nonTexte: z.string().superRefine((_, ctx) => {
        ctx.addIssue({ code: 'custom', message: 'cle.i18n', params: { code: 42 } });
      }),
      simple: z.string().refine(() => false),
      sansParams: z.string().superRefine((_, ctx) => {
        ctx.addIssue({ code: 'custom', message: 'cle.i18n' });
      }),
    });
    const result = schema.safeParse({ metier: 'a', nonTexte: 'b', simple: 'c', sansParams: 'd' });
    if (result.success) throw new Error('le schéma aurait dû échouer');
    expect(toApiError(new InputValidationException(result.error), RID).body.details).toEqual([
      { field: 'metier', code: 'AUTH_PASSWORD_TOO_SHORT' },
      { field: 'nonTexte', code: 'custom' },
      { field: 'simple', code: 'custom' },
      { field: 'sansParams', code: 'custom' },
    ]);
  });

  it('n’écho pas une clé fournie par l’utilisateur qui n’a pas la forme d’un nom de champ', () => {
    const result = z.record(z.string(), z.number()).safeParse({ '<img src=x onerror=1>': 'a' });
    if (result.success) throw new Error('le schéma aurait dû échouer');
    const { body } = toApiError(new InputValidationException(result.error), RID);
    expect(JSON.stringify(body)).not.toContain('<img');
  });

  it('traite une ZodError brute (code interne) comme une erreur serveur, pas comme une 422', () => {
    const result = z.object({ internalColumn: z.number() }).safeParse({ internalColumn: 'x' });
    if (result.success) throw new Error('le schéma aurait dû échouer');
    const { status, body } = toApiError(result.error, RID);
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('internalColumn');
  });

  it.each([
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [400, 'BAD_REQUEST'],
  ])('garde le statut %i d’une erreur client des analyseurs HTTP (body-parser)', (status, code) => {
    const parserError = Object.assign(new Error('détail interne de l’analyseur'), {
      status,
      statusCode: status,
      expose: true,
    });
    const result = toApiError(parserError, RID);
    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
    expect(JSON.stringify(result.body)).not.toContain('analyseur');
  });

  it('ne fait pas confiance à un statut porté par une erreur non exposable ou hors 4xx', () => {
    expect(
      toApiError(Object.assign(new Error('x'), { status: 404, expose: false }), RID).status,
    ).toBe(500);
    expect(
      toApiError(Object.assign(new Error('x'), { status: 302, expose: true }), RID).status,
    ).toBe(500);
  });

  it('masque toute erreur inattendue derrière un 500 générique', () => {
    const { status, body } = toApiError(
      new Error('ECONNREFUSED 10.0.0.3:5432 at /app/src/db.ts:12'),
      RID,
    );
    expect(status).toBe(500);
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: expect.any(String) as string,
      requestId: RID,
    });
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.3|db\.ts/);
  });

  it('traite aussi une valeur lancée qui n’est pas une Error', () => {
    expect(toApiError('chaîne lancée', RID).status).toBe(500);
    expect(toApiError(undefined, RID).body.code).toBe('INTERNAL_ERROR');
  });
});
