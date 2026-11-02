import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { generateOtpCode, OTP_PATTERN, otpDigest, phoneAllowed } from './otp.js';

const KEY = new Uint8Array(32).fill(3);
const USER = '019a0000-0000-7000-8000-000000000001';

describe('generateOtpCode', () => {
  it('rend toujours six chiffres, zéros de tête compris', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999 }), (value) => {
        const code = generateOtpCode(() => value);
        expect(code).toMatch(OTP_PATTERN);
        expect(Number(code)).toBe(value);
      }),
    );
    expect(generateOtpCode(() => 42)).toBe('000042');
  });

  it('tire par défaut dans [0, 10^6[ avec crypto', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateOtpCode()));
    expect(seen.size).toBeGreaterThan(190);
    for (const code of seen) expect(code).toMatch(OTP_PATTERN);
  });

  it('borne demandée au tirage', () => {
    const draw = vi.fn(() => 1);
    generateOtpCode(draw);
    expect(draw).toHaveBeenCalledWith(1_000_000);
  });
});

describe('otpDigest', () => {
  it('dépend de la clé, du compte et du code ; ne contient pas le code', () => {
    const digest = otpDigest(KEY, USER, '123456');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('123456');
    expect(otpDigest(KEY, USER, '123457')).not.toBe(digest);
    expect(otpDigest(KEY, `${USER}x`, '123456')).not.toBe(digest);
    expect(otpDigest(new Uint8Array(32).fill(4), USER, '123456')).not.toBe(digest);
  });
});

describe('numéros', () => {
  it('liste blanche d’indicatifs', () => {
    expect(phoneAllowed('+237650000001', ['+237'])).toBe(true);
    expect(phoneAllowed('+33612345678', ['+237'])).toBe(false);
    expect(phoneAllowed('+33612345678', ['+237', '+33'])).toBe(true);
    expect(phoneAllowed('+237650000001', [])).toBe(false);
  });
});
