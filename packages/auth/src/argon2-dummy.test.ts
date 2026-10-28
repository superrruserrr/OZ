import { describe, expect, it, vi } from 'vitest';

// Échec passager du hachage au premier calcul du hash factice : il ne doit pas rester en cache.
vi.mock('@node-rs/argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@node-rs/argon2')>();
  let failures = 1;
  return {
    ...actual,
    hash: (...args: Parameters<typeof actual.hash>) =>
      failures-- > 0 ? Promise.reject(new Error('mémoire insuffisante')) : actual.hash(...args),
  };
});

describe('hash factice', () => {
  it('ne garde pas en cache un échec de calcul', async () => {
    const { dummyPasswordHash } = await import('./argon2.js');
    await expect(dummyPasswordHash()).rejects.toThrow('mémoire insuffisante');
    await expect(dummyPasswordHash()).resolves.toMatch(/^\$argon2id\$/);
  });
});
