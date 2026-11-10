import { ageAt } from '@oz/core';
import { signupIdentitySchema } from '@oz/contracts';
import { describe, expect, it } from 'vitest';

// Les contrats ne dépendent d'aucun paquet OZ : leur borne d'âge (6 à 45 ans, EX-107 n° 3) est
// recalculée chez eux. Parité avec `@oz/core`, jour par jour autour de chaque borne et au 29 février.
const IDENTITY = { firstName: 'Éliot', lastName: 'Moukoko', nationality: 'CM', country: 'CM' };

function datesAround(years: number): string[] {
  const now = new Date();
  const dates: string[] = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + offset),
    );
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

describe('borne d’âge des contrats = @oz/core (lot 1.7a)', () => {
  it.each([6, 18, 45, 46])('autour de %i ans', (years) => {
    for (const birthDate of [...datesAround(years), '2008-02-29', '2020-02-29']) {
      const age = ageAt(birthDate);
      const accepted = signupIdentitySchema.safeParse({ ...IDENTITY, birthDate }).success;
      expect(accepted, birthDate).toBe(age >= 6 && age <= 45);
    }
  });
});
