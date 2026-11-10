import { z } from 'zod';
import {
  playerSearchCriteriaShape,
  playerSearchSortShape,
  refineSearchCriteria,
  refineSearchSort,
} from '../common/player-search.js';

// Recherches sauvegardées (lot 1.14b, EX-116 n° 3, D2) : critères et tri seuls, jamais un résultat
// ni un OZ ID. Rejouées par la recherche normale, donc avec la portée et la RLS du moment.

/** Au plus 20 par compte (contrainte en base). */
export const SAVED_SEARCHES_MAX = 20;

const criteria = z.strictObject(playerSearchCriteriaShape);

export const savedSearchCreateSchema = z
  .strictObject({
    name: z
      .string()
      .transform((value) => value.normalize('NFC').trim())
      .pipe(
        z
          .string()
          .min(1)
          .max(60)
          // Ni caractère de contrôle ni retour à la ligne : le nom est affiché tel quel.
          .regex(/^[^\p{Cc}]+$/u),
      ),
    criteria: criteria.default({}),
    ...playerSearchSortShape,
  })
  .superRefine((input, context) => {
    refineSearchCriteria(input.criteria, context, ['criteria']);
    refineSearchSort(input.sort, input.criteria.q, context);
  });
export type SavedSearchCreateInput = z.input<typeof savedSearchCreateSchema>;
export type SavedSearchCreateOutput = z.output<typeof savedSearchCreateSchema>;

export const savedSearchParamsSchema = z.strictObject({ id: z.uuid() });
export type SavedSearchParamsInput = z.infer<typeof savedSearchParamsSchema>;

export const savedSearchOutputSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  criteria: z.strictObject(playerSearchCriteriaShape),
  sort: playerSearchSortShape.sort,
  order: playerSearchSortShape.order,
  createdAt: z.iso.datetime(),
});
export type SavedSearchOutput = z.infer<typeof savedSearchOutputSchema>;

export const savedSearchListSchema = z.strictObject({
  items: z.array(savedSearchOutputSchema).max(SAVED_SEARCHES_MAX),
});
export type SavedSearchListOutput = z.infer<typeof savedSearchListSchema>;
