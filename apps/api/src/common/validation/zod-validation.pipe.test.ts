import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { InputValidationException, toApiError } from '../errors/api-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  age: z.number().int(),
});
const pipe = new ZodValidationPipe(schema);

async function rejection(value: unknown): Promise<InputValidationException> {
  try {
    await pipe.transform(value);
  } catch (error) {
    if (error instanceof InputValidationException) return error;
    throw error;
  }
  throw new Error('le pipe aurait dû rejeter');
}

describe('ZodValidationPipe (EX-005 n° 3, CP-05, CP-06)', () => {
  it('renvoie l’objet parsé (normalisé), pas le corps brut', async () => {
    expect(await pipe.transform({ email: '  Junior@Exemple.CM ', age: 16 })).toEqual({
      email: 'junior@exemple.cm',
      age: 16,
    });
  });

  it('rejette une entrée non conforme par une InputValidationException (→ 422)', async () => {
    const error = await rejection({ email: 'x', age: 'seize' });
    expect(toApiError(error, 'r').status).toBe(422);
  });

  it('rejette un champ inconnu en le nommant, code unrecognized_keys', async () => {
    const { body } = toApiError(await rejection({ email: 'a@b.cm', age: 1, isAdmin: true }), 'r');
    expect(body.details).toEqual([{ field: 'isAdmin', code: 'unrecognized_keys' }]);
  });

  it('ne renvoie pas un nom de clé inconnue à la forme inattendue', async () => {
    const { body } = toApiError(
      await rejection({ email: 'a@b.cm', age: 1, '<img src=x>': 1 }),
      'r',
    );
    expect(JSON.stringify(body)).not.toContain('<img');
  });

  it('refuse une valeur qui n’est pas un objet', async () => {
    expect(toApiError(await rejection('texte'), 'r').status).toBe(422);
    expect(toApiError(await rejection(null), 'r').status).toBe(422);
  });

  it('prend en charge les règles asynchrones (sans erreur 500)', async () => {
    const asyncPipe = new ZodValidationPipe(
      z.strictObject({ code: z.string().refine(async (value) => Promise.resolve(value === 'ok')) }),
    );
    await expect(asyncPipe.transform({ code: 'ok' })).resolves.toEqual({ code: 'ok' });
    await expect(asyncPipe.transform({ code: 'ko' })).rejects.toBeInstanceOf(
      InputValidationException,
    );
  });
});
