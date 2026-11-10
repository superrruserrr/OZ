import { describe, expect, it } from 'vitest';
import { savedSearchCreateSchema, savedSearchListSchema } from './saved-search.schema.js';

// Recherches sauvegardées (lot 1.14b, D2) : critères et tri seuls, mêmes bornes que la recherche.

describe('savedSearchCreateSchema', () => {
  it('nom normalisé, critères par défaut vides, tri par nom', () => {
    expect(savedSearchCreateSchema.parse({ name: '  U17 Douala ' })).toEqual({
      name: 'U17 Douala',
      criteria: {},
      sort: 'name',
    });
  });

  it('critères typés comme la recherche', () => {
    const parsed = savedSearchCreateSchema.parse({
      name: 'Gardiens',
      criteria: { country: 'CM', ageMin: 16, ageMax: '18', position: 'goalkeeper', q: ' Éloi ' },
      sort: 'relevance',
      order: 'asc',
    });
    expect(parsed.criteria).toEqual({
      country: 'CM',
      ageMin: 16,
      ageMax: 18,
      position: 'goalkeeper',
      q: 'Éloi',
    });
  });

  it('refuse nom vide, trop long ou à caractère de contrôle, borne inversée, clé inconnue', () => {
    for (const bad of [
      { name: '   ' },
      { name: 'x'.repeat(61) },
      { name: 'a\nb' },
      { name: 'ok', criteria: { ageMin: 19, ageMax: 17 } },
      { name: 'ok', criteria: { heightMin: 190, heightMax: 180 } },
      { name: 'ok', criteria: { limit: 20 } },
      { name: 'ok', criteria: { cursor: 'abc' } },
      { name: 'ok', results: [] },
      { name: 'ok', sort: 'relevance' },
      { name: 'ok', sort: 'heightCm' },
    ]) {
      expect(savedSearchCreateSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('chemin de l’erreur de borne sous `criteria`', () => {
    const result = savedSearchCreateSchema.safeParse({
      name: 'ok',
      criteria: { ageMin: 19, ageMax: 17 },
    });
    expect(result.error?.issues[0]?.path).toEqual(['criteria', 'ageMax']);
  });
});

describe('savedSearchListSchema', () => {
  it('au plus 20 sauvegardes', () => {
    const item = {
      id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      name: 'x',
      criteria: {},
      sort: 'name',
      createdAt: '2026-11-10T10:00:00.000Z',
    };
    expect(savedSearchListSchema.safeParse({ items: Array(20).fill(item) }).success).toBe(true);
    expect(savedSearchListSchema.safeParse({ items: Array(21).fill(item) }).success).toBe(false);
  });
});
