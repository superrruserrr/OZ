import { describe, expect, it } from 'vitest';
import { isMinor } from './minor';

const NOW = new Date('2026-11-17T12:00:00Z');

describe('joueur mineur', () => {
  it('moins de 18 ans révolus : mineur ; le jour des 18 ans : majeur', () => {
    expect(isMinor('2012-03-01', NOW)).toBe(true);
    expect(isMinor('2008-11-18', NOW)).toBe(true);
    expect(isMinor('2008-11-17', NOW)).toBe(false);
    expect(isMinor('1990-01-01', NOW)).toBe(false);
  });

  it('date absente ou mal formée : jamais mineur', () => {
    expect(isMinor(undefined, NOW)).toBe(false);
    expect(isMinor('17/11/2012', NOW)).toBe(false);
  });
});
