import { describe, expect, it } from 'vitest';
import {
  createPersonFactory,
  isSyntheticPerson,
  MAX_SERIES,
  REFERENCE_DATE,
  SYNTHETIC_COUNTRIES,
  type SyntheticPerson,
} from './person.js';

const ageAt = (birthDate: string): number => {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  const [ry, rm, rd] = REFERENCE_DATE.split('-').map(Number) as [number, number, number];
  return ry - y - (rm < m || (rm === m && rd < d) ? 1 : 0);
};

describe('createPersonFactory (EX-006.2, EX-T10.1)', () => {
  it('même graine → mêmes personnes, octet pour octet', () => {
    expect(createPersonFactory(42).persons(50)).toEqual(createPersonFactory(42).persons(50));
  });

  it('graines différentes → personnes différentes', () => {
    expect(createPersonFactory(1).persons(5)).not.toEqual(createPersonFactory(2).persons(5));
  });

  it('marque chaque donnée comme synthétique (D4)', () => {
    for (const person of createPersonFactory(7).persons(200)) {
      expect(person.email).toMatch(/^[a-z0-9.]+@example\.test$/);
      expect(person.phone).toMatch(/^\+999\d{9}$/);
      expect(person.documentNumber).toMatch(/^SYN-[A-Z0-9]{9}$/);
      expect(isSyntheticPerson(person)).toBe(true);
    }
  });

  it('ne répète jamais un téléphone ni un email dans une même série (colonnes uniques)', () => {
    const people = createPersonFactory(8).persons(5000);
    expect(new Set(people.map((p) => p.phone)).size).toBe(5000);
    expect(new Set(people.map((p) => p.email)).size).toBe(5000);
  });

  it('refuse de dépasser la capacité d’une série plutôt que de casser le format du téléphone', () => {
    const factory = createPersonFactory(1, { start: MAX_SERIES - 1 });
    expect(factory.person().phone).toMatch(/^\+999\d{9}$/);
    expect(() => factory.person()).toThrow(/capacité/);
  });

  it('produit des mineurs et des majeurs, de 10 à 40 ans à la date de référence', () => {
    const ages = createPersonFactory(3)
      .persons(500)
      .map((p) => ageAt(p.birthDate));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ages)).toBeLessThanOrEqual(40);
    expect(ages.filter((age) => age < 18).length).toBeGreaterThan(100);
    expect(ages.filter((age) => age >= 18).length).toBeGreaterThan(100);
  });

  it('impose un âge exact sur demande (cas mineur / majeur des tests)', () => {
    const factory = createPersonFactory(9);
    expect(ageAt(factory.person({ age: 16 }).birthDate)).toBe(16);
    expect(ageAt(factory.person({ age: 18 }).birthDate)).toBe(18);
  });

  it('prend le pays dans une liste ISO 3166-1 alpha-2', () => {
    for (const person of createPersonFactory(5).persons(100)) {
      expect(SYNTHETIC_COUNTRIES).toContain(person.country);
      expect(person.country).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('isSyntheticPerson refuse toute donnée sans les trois marqueurs', () => {
    const base: SyntheticPerson = createPersonFactory(11).person();
    expect(isSyntheticPerson({ ...base, email: 'awa.diallo@gmail.com' })).toBe(false);
    expect(isSyntheticPerson({ ...base, phone: '+237690000000' })).toBe(false);
    expect(isSyntheticPerson({ ...base, documentNumber: 'AB1234567' })).toBe(false);
  });
});
