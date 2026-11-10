import { describe, expect, it } from 'vitest';
import { playerSearchExportQuerySchema } from './search-export.schema.js';

// Export CSV (lot 1.14b) : critères de la recherche, sans pagination ; organisation d'imputation.

describe('playerSearchExportQuerySchema', () => {
  it('critères en chaîne de requête, tri par défaut', () => {
    expect(
      playerSearchExportQuerySchema.parse({
        country: 'CM',
        ageMax: '19',
        quotaOrganizationId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      }),
    ).toEqual({
      country: 'CM',
      ageMax: 19,
      sort: 'name',
      quotaOrganizationId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    });
  });

  it('refuse pagination, borne inversée, pertinence sans texte, organisation mal formée', () => {
    for (const bad of [
      { limit: '20' },
      { cursor: 'abc' },
      { ageMin: '20', ageMax: '18' },
      { sort: 'relevance' },
      { quotaOrganizationId: 'abc' },
    ]) {
      expect(playerSearchExportQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
