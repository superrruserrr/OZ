import { z } from 'zod';
import {
  PLAYER_SEARCH_SORTS,
  playerSearchCriteriaShape,
  playerSearchSortShape,
  refineSearchCriteria,
  refineSearchSort,
} from '../common/player-search.js';
import { playerProfileOutputSchema } from './profile.schema.js';

// Recherche v1 (lot 1.14a, EX-116 n° 1, 2) : critères reçus en chaîne de requête, tous facultatifs.
// L'âge est en années par année de naissance (D5), jamais sur la date complète. Le texte libre ne
// porte que sur prénom et nom (D2). Un critère avancé (taille, poids, pied, organisation) est refusé
// par l'API à la portée réduite (D1) ; le schéma ne connaît pas le lecteur.

/** Curseur opaque signé rendu par la page précédente (base64url). */
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);
const between = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export { PLAYER_SEARCH_SORTS };
export type PlayerSearchSortOutput = (typeof PLAYER_SEARCH_SORTS)[number];

export const playerSearchQuerySchema = z
  .strictObject({
    ...playerSearchCriteriaShape,
    ...playerSearchSortShape,
    limit: between(1, 50).default(20),
    cursor: cursor.optional(),
  })
  .superRefine((query, context) => {
    refineSearchCriteria(query, context);
    refineSearchSort(query.sort, query.q, context);
  });
export type PlayerSearchQueryInput = z.input<typeof playerSearchQuerySchema>;
export type PlayerSearchQueryOutput = z.output<typeof playerSearchQuerySchema>;

export const playerSearchPageSchema = z.strictObject({
  /** Chaque joueur dans la vue du lecteur, comme sa fiche. */
  items: z.array(playerProfileOutputSchema).max(50),
  /** À repasser en `cursor` pour la page suivante ; `null` : dernière page. */
  nextCursor: cursor.nullable(),
});
export type PlayerSearchPageOutput = z.infer<typeof playerSearchPageSchema>;
