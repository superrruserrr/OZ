import { z } from 'zod';
import {
  playerSearchCriteriaShape,
  playerSearchSortShape,
  refineSearchCriteria,
  refineSearchSort,
} from '../common/player-search.js';

// Export CSV de la recherche (lot 1.14b, EX-116 n° 4, D3 à D5) : mêmes critères et tri que la
// recherche, sans pagination (le palier borne le nombre de lignes).

export const playerSearchExportQuerySchema = z
  .strictObject({
    ...playerSearchCriteriaShape,
    ...playerSearchSortShape,
    /**
     * Organisation à laquelle l'export est imputé (quota de son palier), requise pour un compte
     * membre de plusieurs organisations. Distincte du critère `organizationId`.
     */
    quotaOrganizationId: z.uuid().optional(),
  })
  .superRefine((query, context) => {
    refineSearchCriteria(query, context);
    refineSearchSort(query.sort, query.q, context);
  });
export type PlayerSearchExportQueryInput = z.input<typeof playerSearchExportQuerySchema>;
export type PlayerSearchExportQueryOutput = z.output<typeof playerSearchExportQuerySchema>;
