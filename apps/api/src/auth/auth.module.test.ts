import { RecaptchaVerifier } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import { describe, expect, it } from 'vitest';
import { recaptchaVerifierFor } from './auth.module.js';

// Le banc HTTP remplace le vérificateur par un double : sa fabrique est vérifiée ici.

const base = { appUrl: 'https://recette.oz.example:8443' } as AuthConfig;

describe('recaptchaVerifierFor (D4 du lot 1.3ca)', () => {
  it('sans secret : aucune vérification', () => {
    expect(recaptchaVerifierFor({ ...base, recaptcha: undefined })).toBeNull();
  });

  it('avec secret : vérificateur construit', () => {
    expect(
      recaptchaVerifierFor({ ...base, recaptcha: { secretKey: 'r'.repeat(40), minScore: 0.5 } }),
    ).toBeInstanceOf(RecaptchaVerifier);
  });
});
