import { describe, expect, it, vi } from 'vitest';

// Une erreur qui ne vient pas de la vérification (bogue, panne) n'est pas déguisée en jeton invalide.
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    jwtVerify: () => Promise.reject(new Error('panne')),
  };
});

const { AccessTokens } = await import('./access-token.js');

describe("jetons d'accès : erreurs inattendues", () => {
  it('propage une erreur qui ne relève pas de jose', async () => {
    const tokens = new AccessTokens(new Uint8Array(64));
    const { token } = await tokens.issue(
      {
        userId: '0b6f5c1e-3d0a-4f39-9a51-7d6f1c2e8a90',
        familyId: '5e2d8c4b-1a7f-4c36-b0e9-3f8a6d1c2b47',
      },
      new Date(),
    );
    await expect(tokens.verify(token, new Date())).rejects.toThrow('panne');
  });
});
