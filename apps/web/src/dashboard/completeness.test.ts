import { describe, expect, it } from 'vitest';
import { profileCompleteness, RUBRICS } from './completeness';

describe('complétude par rubrique (lot 1.5ec, E4)', () => {
  it('six rubriques, chacune la part réelle des champs renseignés', () => {
    const result = profileCompleteness({
      firstName: 'A',
      lastName: 'B',
      birthDate: '2000-01-01',
      nationality: 'CM',
      country: 'CM',
      city: null,
      region: null,
      primaryPosition: 'striker',
      secondaryPosition: null,
      dominantFoot: 'left',
      heightCm: 180,
      weightKg: null,
      verificationLevel: 1,
      phone: null,
    });
    expect(result.rubrics.map((rubric) => rubric.key)).toEqual([...RUBRICS]);
    const value = (key: string) => result.rubrics.find((rubric) => rubric.key === key)?.percent;
    expect(value('identity')).toBe(100);
    expect(value('location')).toBe(33);
    expect(value('sport')).toBe(67);
    expect(value('physical')).toBe(50);
    expect(value('verification')).toBe(50);
    expect(value('contact')).toBe(0);
    expect(result.filled).toBe(9);
    expect(result.total).toBe(15);
  });

  it('fiche vide : zéro partout, jamais de valeur supposée', () => {
    const result = profileCompleteness({});
    expect(result.rubrics.every((rubric) => rubric.percent === 0)).toBe(true);
    expect(result.filled).toBe(0);
  });

  it('l’année de naissance seule compte pour la date (fiche vue par un tiers)', () => {
    const result = profileCompleteness({ birthYear: 2001 });
    expect(result.filled).toBe(1);
  });
});
