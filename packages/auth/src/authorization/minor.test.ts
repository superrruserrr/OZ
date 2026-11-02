import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isMinor } from './minor.js';

const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

describe('isMinor', () => {
  it('mineur la veille des 18 ans, majeur le jour même', () => {
    const birth = utc(2008, 11, 2);
    expect(isMinor(birth, new Date('2026-11-01T23:59:59.999Z'))).toBe(true);
    expect(isMinor(birth, new Date('2026-11-02T00:00:00.000Z'))).toBe(false);
  });

  it('né un 29 février : majeur le 1er mars', () => {
    const birth = utc(2008, 2, 29);
    expect(isMinor(birth, utc(2026, 2, 28))).toBe(true);
    expect(isMinor(birth, utc(2026, 3, 1))).toBe(false);
  });

  it('date invalide : traitée comme mineure', () => {
    expect(isMinor(new Date(Number.NaN), utc(2026, 11, 2))).toBe(true);
  });

  it('propriété : la minorité s’inverse une seule fois, au jour des 18 ans', () => {
    fc.assert(
      fc.property(
        fc.date({ min: utc(1950, 1, 1), max: utc(2030, 12, 31), noInvalidDate: true }),
        fc.integer({ min: 1, max: 40_000 }),
        (birth, days) => {
          const majority = Date.UTC(
            birth.getUTCFullYear() + 18,
            birth.getUTCMonth(),
            birth.getUTCDate(),
          );
          const now = new Date(birth.getTime() + days * 86_400_000);
          expect(isMinor(birth, now)).toBe(now.getTime() < majority);
        },
      ),
    );
  });
});
