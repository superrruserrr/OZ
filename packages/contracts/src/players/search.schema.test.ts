import { describe, expect, it } from 'vitest';
import { playerSearchPageSchema, playerSearchQuerySchema } from './search.schema.js';

// Recherche v1 (lot 1.14a, EX-116 n° 1, 2) : critères stricts reçus en chaîne de requête.

describe('playerSearchQuerySchema', () => {
  it('valeurs par défaut : tri par nom, 20 résultats', () => {
    expect(playerSearchQuerySchema.parse({})).toEqual({ sort: 'name', limit: 20 });
  });

  it('nombres reçus en chaîne, texte libre normalisé', () => {
    const query = playerSearchQuerySchema.parse({
      country: 'CM',
      ageMin: '16',
      ageMax: '19',
      heightMin: '170',
      verificationLevel: '1',
      q: '  Éloïse ',
      sort: 'relevance',
      limit: '50',
    });
    expect(query).toMatchObject({
      country: 'CM',
      ageMin: 16,
      ageMax: 19,
      heightMin: 170,
      verificationLevel: 1,
      q: 'Éloïse',
      sort: 'relevance',
      limit: 50,
    });
  });

  it('refuse clé inconnue, borne inversée, pertinence sans texte, page trop grande', () => {
    for (const bad of [
      { name: 'x' },
      { ageMin: '20', ageMax: '18' },
      { heightMin: '190', heightMax: '180' },
      { weightMin: '90', weightMax: '60' },
      { sort: 'relevance' },
      { limit: '51' },
      { limit: '0' },
      { country: 'cm' },
      { ageMin: '4' },
      { position: 'libero' },
      { q: 'a' },
      { organizationId: 'pas-un-uuid' },
      { verificationLevel: '3' },
      { cursor: 'a b' },
      { sort: 'heightCm' },
    ]) {
      expect(playerSearchQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('playerSearchPageSchema', () => {
  it('page de vues et curseur suivant', () => {
    const page = { items: [{ ozId: 'OZ-CM-26-7K4M9Q-M', birthYear: 2001 }], nextCursor: null };
    expect(playerSearchPageSchema.parse(page)).toEqual(page);
    expect(playerSearchPageSchema.safeParse({ items: [{ phoneHmac: 'x' }] }).success).toBe(false);
  });
});
