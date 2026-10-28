import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateOneTimeToken,
  hashOneTimeToken,
  ONE_TIME_TOKEN_PATTERN,
} from './one-time-token.js';

describe('jetons à usage unique (confirmation, réinitialisation)', () => {
  it('produit 32 octets aléatoires en base64url (43 caractères), tous différents', () => {
    const tokens = new Set(Array.from({ length: 1_000 }, () => generateOneTimeToken()));
    expect(tokens.size).toBe(1_000);
    for (const token of tokens) expect(token).toMatch(ONE_TIME_TOKEN_PATTERN);
  });

  it('accepte une source d’aléa injectée (tests)', () => {
    const token = generateOneTimeToken((target) => target.fill(0));
    expect(token).toBe('A'.repeat(43));
  });

  it("ne stocke que l'empreinte SHA-256 en hexadécimal", () => {
    const token = generateOneTimeToken();
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');
    expect(hashOneTimeToken(token)).toBe(expected);
    expect(hashOneTimeToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuse les formats inattendus', () => {
    expect(ONE_TIME_TOKEN_PATTERN.test('A'.repeat(42))).toBe(false);
    expect(ONE_TIME_TOKEN_PATTERN.test('A'.repeat(44))).toBe(false);
    expect(ONE_TIME_TOKEN_PATTERN.test(`${'A'.repeat(42)}=`)).toBe(false);
  });
});
