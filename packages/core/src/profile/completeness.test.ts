import { describe, expect, it } from 'vitest';
import { COMPLETENESS_WEIGHTS, profileCompleteness } from './completeness.js';

describe('score de complétude (P4, EX-121)', () => {
  it('les poids totalisent 100', () => {
    expect(Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('0 pour un profil vide, 100 pour un profil complet', () => {
    expect(profileCompleteness({})).toBe(0);
    const full = Object.fromEntries(
      Object.keys(COMPLETENESS_WEIGHTS).map((key) => [
        key,
        key.endsWith('Cm') || key.endsWith('Kg')
          ? 180
          : key === 'phoneVerified' ||
              key === 'photo' ||
              key === 'organization' ||
              key === 'identityVerified'
            ? true
            : 'x',
      ]),
    );
    expect(profileCompleteness(full)).toBe(100);
  });

  it('inscription minimale (identité et sport obligatoires) : 40', () => {
    expect(
      profileCompleteness({
        firstName: 'Éliot',
        lastName: 'Moukoko',
        birthDate: '2006-04-02',
        country: 'CM',
        primaryPosition: 'striker',
        dominantFoot: 'right',
        city: null,
        phoneVerified: false,
      }),
    ).toBe(40);
  });
});
