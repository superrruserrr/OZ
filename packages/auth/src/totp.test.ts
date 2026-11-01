import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  generateTotpCode,
  generateTotpSecret,
  totpStep,
  totpUri,
  TOTP_PERIOD_SECONDS,
  verifyTotpCode,
} from './totp.js';

// « 12345678901234567890 » en base32 : secret SHA-1 de l'annexe B de la RFC 6238.
const RFC_SECRET = ['GEZDGNBV', 'GY3TQOJQ'].join('').repeat(2);
const PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;

describe('TOTP (D1, D2)', () => {
  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
  ])('vecteur RFC 6238 à T = %i', (seconds, code) => {
    const nowMs = seconds * 1000;
    expect(generateTotpCode(RFC_SECRET, nowMs)).toBe(code);
    expect(verifyTotpCode({ secret: RFC_SECRET, code, nowMs })).toBe(totpStep(nowMs));
  });

  it('secret de 160 bits en base32, différent à chaque appel', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('URI otpauth : émetteur OZ, sans paramètre autre que les valeurs standard', () => {
    const uri = new URL(totpUri({ secret: RFC_SECRET, label: 'a@example.test' }));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(uri.searchParams.get('issuer')).toBe('OZ');
    expect(uri.searchParams.get('secret')).toBe(RFC_SECRET);
    // SHA-1, 6 chiffres et 30 s sont les valeurs par défaut du format : absentes ou explicites.
    expect(['SHA1', null]).toContain(uri.searchParams.get('algorithm'));
    expect(['6', null]).toContain(uri.searchParams.get('digits'));
    expect(['30', null]).toContain(uri.searchParams.get('period'));
  });

  it('accepte un pas de décalage de part et d’autre, rend le pas du code', () => {
    const nowMs = 1_700_000_000_000;
    const step = totpStep(nowMs);
    for (const offset of [-1, 0, 1]) {
      const code = generateTotpCode(RFC_SECRET, nowMs + offset * PERIOD_MS);
      expect(verifyTotpCode({ secret: RFC_SECRET, code, nowMs })).toBe(step + offset);
    }
  });

  it('propriété : un code à deux pas ou plus est refusé', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000_000, max: 4_000_000_000 }),
        fc.integer({ min: 2, max: 20 }),
        fc.boolean(),
        (seconds, distance, past) => {
          const nowMs = seconds * 1000;
          const other = nowMs + (past ? -distance : distance) * PERIOD_MS;
          const code = generateTotpCode(RFC_SECRET, other);
          // Collision de 6 chiffres possible : seul un code différent des trois pas admis compte.
          const admitted = [-1, 0, 1].map((o) =>
            generateTotpCode(RFC_SECRET, nowMs + o * PERIOD_MS),
          );
          fc.pre(!admitted.includes(code));
          expect(verifyTotpCode({ secret: RFC_SECRET, code, nowMs })).toBeNull();
        },
      ),
    );
  });

  it('anti-rejeu : un pas déjà consommé, ou antérieur, est refusé', () => {
    const nowMs = 1_700_000_000_000;
    const step = totpStep(nowMs);
    const code = generateTotpCode(RFC_SECRET, nowMs);
    const verify = (lastStep: number) =>
      verifyTotpCode({ secret: RFC_SECRET, code, nowMs, lastStep });
    expect(verify(step)).toBeNull();
    expect(verify(step + 1)).toBeNull();
    expect(verify(step - 1)).toBe(step);
  });

  it('dernier pas en avance sur l’horloge : refus, jamais d’exception', () => {
    const nowMs = 1_700_000_000_000;
    const code = generateTotpCode(RFC_SECRET, nowMs);
    for (const lastStep of [1, 2, 50]) {
      expect(
        verifyTotpCode({ secret: RFC_SECRET, code, nowMs, lastStep: totpStep(nowMs) + lastStep }),
      ).toBeNull();
    }
  });

  it.each(['', '12345', '1234567', 'abcdef', '12 456', '１２３４５６'])(
    'code mal formé refusé sans exception : %j',
    (code) => {
      expect(verifyTotpCode({ secret: RFC_SECRET, code, nowMs: 1_000_000 })).toBeNull();
    },
  );
});
