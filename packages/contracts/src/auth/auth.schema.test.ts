import { describe, expect, it } from 'vitest';
import { newPassword, oneTimeToken } from '../common/fields.js';
import {
  accessTokenOutputSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  sessionListOutputSchema,
  sessionParamsSchema,
  verifyEmailSchema,
} from './auth.schema.js';

const TOKEN = 'A'.repeat(43);
const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('nouveau mot de passe (EX-103 n° 2)', () => {
  it('exige 12 à 128 caractères, sans règle de composition', () => {
    expect(newPassword.safeParse('a'.repeat(12)).success).toBe(true);
    expect(newPassword.safeParse('tout en minuscules').success).toBe(true);
    expect(issues(newPassword.safeParse('a'.repeat(11)))).toEqual(['validation.password.tooShort']);
    expect(issues(newPassword.safeParse('a'.repeat(129)))).toEqual(['validation.password.tooLong']);
  });

  it('compte les caractères (emoji, accents décomposés) et ne retire pas les espaces', () => {
    expect(newPassword.safeParse('😀'.repeat(11)).success).toBe(false);
    expect(newPassword.safeParse('😀'.repeat(12)).success).toBe(true);
    expect(newPassword.parse('  espaces gardés  ')).toBe('  espaces gardés  ');
  });

  it('refuse une chaîne UTF-16 mal formée et une entrée démesurée', () => {
    expect(issues(newPassword.safeParse('\uD800'.repeat(12)))).toEqual([
      'validation.password.invalid',
    ]);
    expect(issues(newPassword.safeParse('a'.repeat(100_000)))).toEqual([
      'validation.password.tooLong',
    ]);
  });
});

describe('jeton à usage unique', () => {
  it('accepte exactement 43 caractères base64url', () => {
    expect(oneTimeToken.safeParse(TOKEN).success).toBe(true);
    expect(oneTimeToken.safeParse('A'.repeat(42)).success).toBe(false);
    expect(oneTimeToken.safeParse(`${'A'.repeat(42)}=`).success).toBe(false);
    expect(issues(oneTimeToken.safeParse('x'))).toEqual(['validation.token.invalid']);
  });
});

describe('contrats d’authentification', () => {
  it('inscription : email normalisé et mot de passe conforme', () => {
    expect(
      registerSchema.parse({ email: ' Nouvelle@Example.TEST ', password: 'correct horse battery' }),
    ).toEqual({ email: 'nouvelle@example.test', password: 'correct horse battery' });
    expect(registerSchema.safeParse({ email: 'x@example.test', password: 'court' }).success).toBe(
      false,
    );
  });

  it('refuse toute clé inconnue', () => {
    expect(
      registerSchema.safeParse({
        email: 'x@example.test',
        password: 'correct horse battery',
        status: 'active',
      }).success,
    ).toBe(false);
  });

  it('confirmation, demande et réinitialisation', () => {
    expect(verifyEmailSchema.parse({ token: TOKEN })).toEqual({ token: TOKEN });
    expect(requestPasswordResetSchema.parse({ email: 'A@B.TEST' })).toEqual({ email: 'a@b.test' });
    expect(
      resetPasswordSchema.parse({ token: TOKEN, password: 'correct horse battery' }).password,
    ).toBe('correct horse battery');
    expect(resetPasswordSchema.safeParse({ token: TOKEN, password: 'court' }).success).toBe(false);
  });

  it('connexion : n’applique pas la politique (anciens mots de passe), mais borne la taille', () => {
    expect(loginSchema.safeParse({ email: 'a@b.test', password: 'court' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.test', password: 'a'.repeat(513) }).success).toBe(
      false,
    );
  });
});

describe('réponse du jeton d’accès (lot 1.3b)', () => {
  it('jeton et durée en secondes, rien d’autre', () => {
    expect(
      accessTokenOutputSchema.safeParse({ accessToken: 'a.b.c', expiresIn: 900 }).success,
    ).toBe(true);
    expect(
      accessTokenOutputSchema.safeParse({
        accessToken: 'a.b.c',
        expiresIn: 900,
        refreshToken: 'x',
      }).success,
    ).toBe(false);
    expect(accessTokenOutputSchema.safeParse({ accessToken: '', expiresIn: 900 }).success).toBe(
      false,
    );
  });
});

describe('sessions (lot 1.3b)', () => {
  const ID = '00000000-0000-4000-8000-000000000001';
  const session = {
    id: ID,
    device: 'Firefox · macOS',
    ip: '198.51.100.0/24',
    createdAt: '2026-10-28T08:00:00.000Z',
    lastUsedAt: null,
    current: true,
  };

  it('identifiant de session : UUID seulement', () => {
    expect(sessionParamsSchema.safeParse({ id: ID }).success).toBe(true);
    expect(sessionParamsSchema.safeParse({ id: '1' }).success).toBe(false);
    expect(sessionParamsSchema.safeParse({ id: ID, extra: 1 }).success).toBe(false);
  });

  it('liste sans champ technique', () => {
    expect(sessionListOutputSchema.safeParse({ sessions: [session] }).success).toBe(true);
    expect(
      sessionListOutputSchema.safeParse({ sessions: [{ ...session, refreshTokenHash: 'x' }] })
        .success,
    ).toBe(false);
    expect(
      sessionListOutputSchema.safeParse({ sessions: [{ ...session, createdAt: 'hier' }] }).success,
    ).toBe(false);
  });
});
