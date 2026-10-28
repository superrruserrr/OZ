import { describe, expect, it } from 'vitest';
import { hash as rawHash } from '@node-rs/argon2';
import {
  ARGON2_PARAMS,
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './argon2.js';

describe('Argon2id (EX-103 n° 2, OWASP)', () => {
  it('fige les paramètres m=19456, t=2, p=1', () => {
    expect(ARGON2_PARAMS).toEqual({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
  });

  it('produit un hash PHC Argon2id aux paramètres figés, salé à chaque appel', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
  });

  it('vérifie le bon mot de passe, refuse le mauvais', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(stored, 'correct horse batterz')).toBe(false);
  });

  it('vérifie après normalisation NFKC (accent composé ou décomposé)', async () => {
    const stored = await hashPassword('mot de passe é');
    expect(await verifyPassword(stored, 'mot de passe é')).toBe(true);
  });

  it('refuse de hacher une entrée hors politique, et la vérifie comme fausse sans calcul', async () => {
    await expect(hashPassword('\uD800'.repeat(12))).rejects.toThrow(RangeError);
    await expect(hashPassword('a'.repeat(10_000))).rejects.toThrow(RangeError);
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword(stored, 'a'.repeat(10_000))).toBe(false);
  });

  it('refuse un hash illisible sans lever', async () => {
    expect(await verifyPassword('pas-un-hash', 'correct horse battery')).toBe(false);
  });

  it('signale un hash aux paramètres périmés, pas un hash courant', async () => {
    const current = await hashPassword('correct horse battery');
    const weaker = await rawHash('correct horse battery', {
      memoryCost: 8192,
      timeCost: 1,
      parallelism: 1,
    });
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash(weaker)).toBe(true);
    expect(needsRehash('pas-un-hash')).toBe(true);
    expect(await verifyPassword(weaker, 'correct horse battery')).toBe(true);
  });

  it('fournit un hash factice stable pour égaliser le temps de réponse', async () => {
    const dummy = await dummyPasswordHash();
    expect(await dummyPasswordHash()).toBe(dummy);
    expect(dummy).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(dummy, 'correct horse battery')).toBe(false);
  });
});
