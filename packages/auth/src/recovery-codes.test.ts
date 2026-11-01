import { describe, expect, it } from 'vitest';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes.js';

const KEY = new Uint8Array(32).fill(3);

describe('codes de secours (D5)', () => {
  it('10 codes lisibles, distincts, 80 bits d’aléa', () => {
    const codes = generateRecoveryCodes();
    expect(RECOVERY_CODE_COUNT).toBe(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  });

  it('l’aléa couvre tout l’alphabet, à toutes les positions', () => {
    const codes = Array.from({ length: 40 }, () => generateRecoveryCodes()).flat();
    const first = new Set(codes.map((code) => code[0]));
    const last = new Set(codes.map((code) => code.at(-1)));
    expect(first.size).toBeGreaterThan(20);
    expect(last.size).toBeGreaterThan(20);
  });

  it('normalise la saisie : casse, tirets et espaces', () => {
    expect(normalizeRecoveryCode(' abcd-efgh ijkl-mnop\n')).toBe('ABCDEFGHIJKLMNOP');
    expect(normalizeRecoveryCode('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKLMNOP');
  });

  it.each(['', 'ABCD', 'ABCDEFGHIJKLMNOPQ', 'ABCD-EFGH-IJKL-MN01', '123456'])(
    'saisie invalide : %j',
    (input) => {
      expect(normalizeRecoveryCode(input)).toBeNull();
    },
  );

  it('empreinte : stable selon la saisie, dépend de la clé, sans le code', () => {
    const code = 'ABCD-EFGH-IJKL-MNOP';
    const digest = hashRecoveryCode(KEY, code);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hashRecoveryCode(KEY, 'abcd efgh ijkl mnop'));
    expect(digest).not.toBe(hashRecoveryCode(new Uint8Array(32).fill(4), code));
    expect(digest).not.toContain('ABCD');
  });

  it('empreinte d’une saisie invalide : exception, jamais d’empreinte vide', () => {
    expect(() => hashRecoveryCode(KEY, 'court')).toThrow();
  });
});
