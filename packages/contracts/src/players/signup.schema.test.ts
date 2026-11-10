import { describe, expect, it } from 'vitest';
import {
  signupGuardianSchema,
  signupIdentitySchema,
  signupSportSchema,
  signupStepParamsSchema,
} from './signup.schema.js';

/** Date de naissance donnant `years` ans révolus aujourd'hui. */
const bornYearsAgo = (years: number, dayOffset = 0): string => {
  const date = new Date(
    Date.UTC(
      new Date().getUTCFullYear() - years,
      new Date().getUTCMonth(),
      new Date().getUTCDate() + dayOffset,
    ),
  );
  return date.toISOString().slice(0, 10);
};

const IDENTITY = {
  firstName: 'Éliot',
  lastName: 'Moukoko',
  birthDate: bornYearsAgo(20),
  nationality: 'CM',
  country: 'CM',
  city: 'Douala',
};

describe('étape identité', () => {
  it('accepte un majeur et un mineur de 6 ans', () => {
    expect(signupIdentitySchema.safeParse(IDENTITY).success).toBe(true);
    expect(
      signupIdentitySchema.safeParse({ ...IDENTITY, birthDate: bornYearsAgo(6) }).success,
    ).toBe(true);
    expect(
      signupIdentitySchema.safeParse({ ...IDENTITY, birthDate: bornYearsAgo(45) }).success,
    ).toBe(true);
  });

  it('refuse moins de 6 ans, plus de 45 ans, une date impossible', () => {
    for (const birthDate of [bornYearsAgo(6, 1), bornYearsAgo(46), '2010-02-30', '20-01-2010']) {
      expect(signupIdentitySchema.safeParse({ ...IDENTITY, birthDate }).success, birthDate).toBe(
        false,
      );
    }
  });

  it('refuse un champ en trop et un pays mal formé', () => {
    expect(signupIdentitySchema.safeParse({ ...IDENTITY, ozId: 'OZ-CM-26-7K4M9Q-3' }).success).toBe(
      false,
    );
    expect(signupIdentitySchema.safeParse({ ...IDENTITY, country: 'cm' }).success).toBe(false);
  });
});

describe('étape sport', () => {
  it('refuse un poste secondaire identique au principal et une taille hors bornes', () => {
    const sport = { primaryPosition: 'striker', dominantFoot: 'right' } as const;
    expect(signupSportSchema.safeParse(sport).success).toBe(true);
    expect(signupSportSchema.safeParse({ ...sport, secondaryPosition: 'striker' }).success).toBe(
      false,
    );
    expect(signupSportSchema.safeParse({ ...sport, heightCm: 250 }).success).toBe(false);
  });
});

describe('étape tuteur', () => {
  const guardian = { firstName: 'Awa', lastName: 'Moukoko', relationship: 'mother', country: 'CM' };
  it('exige un téléphone ou un email', () => {
    expect(signupGuardianSchema.safeParse(guardian).success).toBe(false);
    expect(signupGuardianSchema.safeParse({ ...guardian, phone: '+237690000000' }).success).toBe(
      true,
    );
    expect(signupGuardianSchema.safeParse({ ...guardian, email: 'awa@exemple.test' }).success).toBe(
      true,
    );
  });
});

it('étape inconnue refusée', () => {
  expect(signupStepParamsSchema.safeParse({ step: 'photo' }).success).toBe(false);
});
