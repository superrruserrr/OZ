import { describe, expect, it } from 'vitest';
import {
  checkFormToken,
  FORM_TOKEN_MAX_AGE_MS,
  FORM_TOKEN_MIN_AGE_MS,
  FORM_TOKEN_PATTERN,
  issueFormToken,
} from './form-token.js';

// Jeton de formulaire d'inscription (lot 1.3ca, D6) : chronométrie signée par le serveur.

const KEY = 'k'.repeat(40);
const T0 = Date.UTC(2026, 9, 28, 12);

describe('jeton de formulaire', () => {
  it('format fixe, sans donnée personnelle, différent à chaque émission', () => {
    const token = issueFormToken(KEY, T0);
    expect(token).toMatch(FORM_TOKEN_PATTERN);
    expect(issueFormToken(KEY, T0)).not.toBe(token);
  });

  it('accepté entre 3 s et 2 h après émission', () => {
    const token = issueFormToken(KEY, T0);
    expect(checkFormToken(KEY, token, T0 + FORM_TOKEN_MIN_AGE_MS)).toBe('valid');
    expect(checkFormToken(KEY, token, T0 + FORM_TOKEN_MAX_AGE_MS)).toBe('valid');
  });

  it('trop jeune (< 3 s) : too_fast ; expiré (> 2 h) : expired', () => {
    const token = issueFormToken(KEY, T0);
    expect(checkFormToken(KEY, token, T0 + FORM_TOKEN_MIN_AGE_MS - 1)).toBe('too_fast');
    expect(checkFormToken(KEY, token, T0 - 60_000)).toBe('too_fast');
    expect(checkFormToken(KEY, token, T0 + FORM_TOKEN_MAX_AGE_MS + 1)).toBe('expired');
  });

  it('altéré, signé avec une autre clé ou illisible : invalid', () => {
    const token = issueFormToken(KEY, T0);
    const later = T0 + 10_000;
    expect(checkFormToken('autre'.repeat(8), token, later)).toBe('invalid');
    const flip = (index: number) =>
      token.slice(0, index) + (token[index] === 'A' ? 'B' : 'A') + token.slice(index + 1);
    expect(checkFormToken(KEY, flip(3), later)).toBe('invalid');
    expect(checkFormToken(KEY, flip(token.length - 2), later)).toBe('invalid');
    for (const bad of ['', 'x', 'a.b', `${token}x`, token.replace('.', '')]) {
      expect(checkFormToken(KEY, bad, later)).toBe('invalid');
    }
  });

  it('signature en base64url non canonique (bits de fin modifiés) : invalid', () => {
    const token = issueFormToken(KEY, T0);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(token.slice(-1));
    // Les 2 bits de poids faible du dernier caractère ne portent aucun octet.
    const twin = token.slice(0, -1) + (alphabet[last ^ 1] ?? '');
    expect(checkFormToken(KEY, twin, T0 + 10_000)).toBe('invalid');
  });

  it('horodatage rejoué avec la signature d’un autre jeton : invalid', () => {
    const [payloadA] = issueFormToken(KEY, T0).split('.');
    const [, macB] = issueFormToken(KEY, T0 - 3_600_000).split('.');
    expect(checkFormToken(KEY, `${String(payloadA)}.${String(macB)}`, T0 + 10_000)).toBe('invalid');
  });
});
