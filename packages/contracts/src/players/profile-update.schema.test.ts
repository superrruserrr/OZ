import { describe, expect, it } from 'vitest';
import { playerProfileUpdateInputSchema } from './profile-update.schema.js';

const parse = (value: unknown) => playerProfileUpdateInputSchema.safeParse(value);

describe('playerProfileUpdateInputSchema (lot 1.19cb)', () => {
  it('mise à jour partielle : un champ suffit ; null efface un champ facultatif', () => {
    expect(parse({ city: 'Douala' }).success).toBe(true);
    expect(parse({ city: null, heightCm: null, secondaryPosition: null }).success).toBe(true);
    expect(parse({ firstName: '  Abena ' }).data).toEqual({ firstName: 'Abena' });
  });

  it('refuse un corps vide ou sans valeur', () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ city: undefined }).success).toBe(false);
  });

  it('liste blanche : pays, date de naissance, statut, visibilité, OZ ID refusés', () => {
    for (const extra of [
      { country: 'GH' },
      { birthDate: '2000-01-01' },
      { verificationStatus: 'verified' },
      { visibility: { physical: false } },
      { ozId: 'OZ-CM-26-7K4M9Q-M' },
      { organizationId: '0190a5f4-0000-7000-8000-000000000000' },
    ]) {
      expect(parse(extra).success, JSON.stringify(extra)).toBe(false);
    }
  });

  it('bornes de l’inscription : taille 80–230 cm, poids 15–150 kg, entiers', () => {
    expect(parse({ heightCm: 79 }).success).toBe(false);
    expect(parse({ heightCm: 231 }).success).toBe(false);
    expect(parse({ weightKg: 70.5 }).success).toBe(false);
    expect(parse({ heightCm: 180, weightKg: 72 }).success).toBe(true);
  });

  it('effacement interdit des champs obligatoires ; poste secondaire différent du principal', () => {
    expect(parse({ firstName: null }).success).toBe(false);
    expect(parse({ primaryPosition: null }).success).toBe(false);
    expect(parse({ dominantFoot: null }).success).toBe(false);
    const dup = parse({ primaryPosition: 'striker', secondaryPosition: 'striker' });
    expect(dup.error?.issues[0]?.message).toBe('validation.position.duplicate');
  });

  it('nationalité ISO-2 majuscule ; texte de lieu borné à 80', () => {
    expect(parse({ nationality: 'cm' }).success).toBe(false);
    expect(parse({ region: 'x'.repeat(81) }).success).toBe(false);
  });
});
