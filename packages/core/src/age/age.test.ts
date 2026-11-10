import { describe, expect, it } from 'vitest';
import { ageAt, isMinor } from './age.js';

const TODAY = new Date('2026-11-11T23:30:00Z');

describe('âge révolu et minorité (lot 1.7a)', () => {
  it('la veille et le jour de l’anniversaire, en UTC', () => {
    expect(ageAt('2008-11-12', TODAY)).toBe(17);
    expect(ageAt('2008-11-11', TODAY)).toBe(18);
    expect(isMinor('2008-11-12', TODAY)).toBe(true);
    expect(isMinor('2008-11-11', TODAY)).toBe(false);
  });

  it('29 février : majeur le 1er mars d’une année non bissextile, comme oz_is_minor_at', () => {
    expect(isMinor('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(true);
    expect(isMinor('2008-02-29', new Date('2026-03-01T00:00:00Z'))).toBe(false);
    expect(isMinor('2008-02-29', new Date('2028-02-29T00:00:00Z'))).toBe(false);
  });

  it('refuse une date mal formée', () => {
    expect(() => ageAt('11/11/2008', TODAY)).toThrow(RangeError);
  });
});
