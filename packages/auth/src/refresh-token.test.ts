import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_PATTERN } from './refresh-token.js';

const key = new Uint8Array(64).fill(3);

describe('jetons de rafraîchissement (EX-103 n° 4)', () => {
  it('produit 32 octets aléatoires en base64url, tous différents', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(REFRESH_TOKEN_PATTERN);
    expect(generateRefreshToken((target) => target.fill(0))).toBe('A'.repeat(43));
  });

  it('empreinte HMAC-SHA-256 en hexadécimal, déterministe pour une clé', () => {
    const token = generateRefreshToken();
    const expected = createHmac('sha256', key).update(token).digest('hex');
    expect(hashRefreshToken(token, key)).toBe(expected);
    expect(hashRefreshToken(token, key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('dépend de la clé : une rotation de clé invalide toutes les empreintes', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token, key)).not.toBe(
      hashRefreshToken(token, new Uint8Array(64).fill(4)),
    );
  });

  it('exige une clé de 64 octets et un jeton bien formé', () => {
    expect(() => hashRefreshToken(generateRefreshToken(), new Uint8Array(32))).toThrow(RangeError);
    expect(() => hashRefreshToken('x'.repeat(10_000), key)).toThrow(TypeError);
  });
});
