import { describe, expect, it } from 'vitest';
import {
  checkPasswordPolicy,
  isAcceptablePasswordInput,
  PASSWORD_MAX_INPUT_UNITS,
  normalizePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
} from './password-policy.js';

describe('politique de mot de passe (EX-103 n° 2)', () => {
  it('fixe les bornes à 12 et 128 caractères', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it('refuse 11 caractères, accepte 12 sans aucune règle de composition', () => {
    expect(checkPasswordPolicy('a'.repeat(11))).toBe('AUTH_PASSWORD_TOO_SHORT');
    expect(checkPasswordPolicy('a'.repeat(12))).toBeNull();
    expect(checkPasswordPolicy('tout en minuscules')).toBeNull();
  });

  it('refuse au-delà de 128 caractères', () => {
    expect(checkPasswordPolicy('a'.repeat(128))).toBeNull();
    expect(checkPasswordPolicy('a'.repeat(129))).toBe('AUTH_PASSWORD_TOO_LONG');
  });

  it('compte les caractères, pas les unités UTF-16', () => {
    // 11 emoji = 22 unités UTF-16 mais 11 caractères.
    expect(passwordLength('😀'.repeat(11))).toBe(11);
    expect(checkPasswordPolicy('😀'.repeat(11))).toBe('AUTH_PASSWORD_TOO_SHORT');
    expect(checkPasswordPolicy('😀'.repeat(12))).toBeNull();
  });

  it('normalise en NFKC : un accent composé ou décomposé donne le même mot de passe', () => {
    const composed = 'mot de passe é';
    const decomposed = 'mot de passe é';
    expect(normalizePassword(decomposed)).toBe(normalizePassword(composed));
    expect(passwordLength(decomposed)).toBe(passwordLength(composed));
  });

  it('refuse une moitié de paire de substitution isolée (deux mots de passe auraient le même hash)', () => {
    expect(checkPasswordPolicy('\uD800'.repeat(12))).toBe('AUTH_PASSWORD_MALFORMED');
    expect(isAcceptablePasswordInput('mot de passe \uDBFF')).toBe(false);
    expect(isAcceptablePasswordInput('😀'.repeat(12))).toBe(true);
  });

  it('refuse une entrée démesurée avant toute normalisation', () => {
    expect(PASSWORD_MAX_INPUT_UNITS).toBe(512);
    expect(checkPasswordPolicy('a'.repeat(10_000_000))).toBe('AUTH_PASSWORD_TOO_LONG');
    expect(isAcceptablePasswordInput('a'.repeat(513))).toBe(false);
  });
});
