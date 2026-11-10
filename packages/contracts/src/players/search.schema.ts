import { z } from 'zod';
import { playerPositionSchema, playerProfileOutputSchema } from './profile.schema.js';

// Recherche v1 (lot 1.14a, EX-116 n° 1, 2) : critères reçus en chaîne de requête, tous facultatifs.
// L'âge est en années par année de naissance (D5), jamais sur la date complète. Le texte libre ne
// porte que sur prénom et nom (D2). Un critère avancé (taille, poids, pied, organisation) est refusé
// par l'API à la portée réduite (D1) ; le schéma ne connaît pas le lecteur.

/** Curseur opaque signé rendu par la page précédente (base64url). */
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);
const place = z.string().trim().min(1).max(80);
const between = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** Tris permis : jamais sur un champ d'un bloc masquable (D4). */
export const PLAYER_SEARCH_SORTS = ['name', 'birthYear', 'recent', 'relevance'] as const;
export type PlayerSearchSortOutput = (typeof PLAYER_SEARCH_SORTS)[number];

const ordered = (min: number | undefined, max: number | undefined) =>
  min === undefined || max === undefined || min <= max;

export const playerSearchQuerySchema = z
  .strictObject({
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
    sort: z.enum(PLAYER_SEARCH_SORTS).default('name'),
    /** Par défaut : croissant pour `name` et `birthYear`, décroissant pour `recent` et `relevance`. */
    order: z.enum(['asc', 'desc']).optional(),
    limit: between(1, 50).default(20),
    cursor: cursor.optional(),
  })
  .refine((query) => ordered(query.ageMin, query.ageMax), {
    message: 'L’âge minimal dépasse l’âge maximal.',
    path: ['ageMax'],
  })
  .refine((query) => ordered(query.heightMin, query.heightMax), {
    message: 'La taille minimale dépasse la taille maximale.',
    path: ['heightMax'],
  })
  .refine((query) => ordered(query.weightMin, query.weightMax), {
    message: 'Le poids minimal dépasse le poids maximal.',
    path: ['weightMax'],
  })
  .refine((query) => query.sort !== 'relevance' || query.q !== undefined, {
    message: 'Le tri par pertinence demande un texte.',
    path: ['sort'],
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
