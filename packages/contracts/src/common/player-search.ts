import { z } from 'zod';
import { playerPositionSchema } from '../players/profile.schema.js';

// Critères, tri et raffinements de la recherche de joueurs (lot 1.14a), partagés par la recherche,
// les recherches sauvegardées et l'export CSV (lot 1.14b).

const place = z.string().trim().min(1).max(80);
const between = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** Tris permis : jamais sur un champ d'un bloc masquable (D4). */
export const PLAYER_SEARCH_SORTS = ['name', 'birthYear', 'recent', 'relevance'] as const;

const ordered = (min: number | undefined, max: number | undefined) =>
  min === undefined || max === undefined || min <= max;

/** Critères de recherche, partagés par la recherche, les recherches sauvegardées et l'export (1.14b). */
export const playerSearchCriteriaShape = {
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  region: place.optional(),
  city: place.optional(),
  ageMin: between(5, 60).optional(),
  ageMax: between(5, 60).optional(),
  /** Poste principal ou secondaire. */
  position: playerPositionSchema.optional(),
  foot: z.enum(['left', 'right', 'both']).optional(),
  heightMin: between(100, 230).optional(),
  heightMax: between(100, 230).optional(),
  weightMin: between(25, 150).optional(),
  weightMax: between(25, 150).optional(),
  /** Niveau de badge minimal : 0 email, 1 email et téléphone, 2 identité. */
  verificationLevel: between(0, 2).optional(),
  organizationId: z.uuid().optional(),
  /** Prénom ou nom, accents et casse ignorés. */
  q: z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(z.string().min(2).max(60))
    .optional(),
};

/** Tri et sens, partagés de même. */
export const playerSearchSortShape = {
  sort: z.enum(PLAYER_SEARCH_SORTS).default('name'),
  /** Par défaut : croissant pour `name` et `birthYear`, décroissant pour `recent` et `relevance`. */
  order: z.enum(['asc', 'desc']).optional(),
};

interface Bounded {
  readonly ageMin?: number | undefined;
  readonly ageMax?: number | undefined;
  readonly heightMin?: number | undefined;
  readonly heightMax?: number | undefined;
  readonly weightMin?: number | undefined;
  readonly weightMax?: number | undefined;
}

/** Bornes min ≤ max des critères, chemins relatifs à `prefix`. */
export function refineSearchCriteria(
  criteria: Bounded,
  context: z.RefinementCtx,
  prefix: readonly string[] = [],
): void {
  const check = (
    min: number | undefined,
    max: number | undefined,
    field: string,
    message: string,
  ) => {
    if (!ordered(min, max)) context.addIssue({ code: 'custom', message, path: [...prefix, field] });
  };
  check(criteria.ageMin, criteria.ageMax, 'ageMax', 'L’âge minimal dépasse l’âge maximal.');
  check(
    criteria.heightMin,
    criteria.heightMax,
    'heightMax',
    'La taille minimale dépasse la taille maximale.',
  );
  check(
    criteria.weightMin,
    criteria.weightMax,
    'weightMax',
    'Le poids minimal dépasse le poids maximal.',
  );
}

/** Le tri par pertinence demande un texte. */
export function refineSearchSort(
  sort: (typeof PLAYER_SEARCH_SORTS)[number],
  q: string | undefined,
  context: z.RefinementCtx,
): void {
  if (sort === 'relevance' && q === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Le tri par pertinence demande un texte.',
      path: ['sort'],
    });
  }
}
