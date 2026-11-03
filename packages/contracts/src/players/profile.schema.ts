import { z } from 'zod';

// Fiche joueur (lot 1.13a, EX-115 n° 1 à 3) : sérialisée selon la vue du lecteur (EX-104), chaque
// champ facultatif car absent des vues qui ne le portent pas — jamais `null` pour « masqué ». Les
// blocs réglables ne s'appliquent qu'aux tiers.

/** OZ ID canonique (TD-017) ; l'API répond le même 404 à un OZ ID mal formé. */
export const playerProfileParamsSchema = z.strictObject({
  ozId: z.string().regex(/^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$/),
});
export type PlayerProfileParamsInput = z.infer<typeof playerProfileParamsSchema>;

const position = z.enum([
  'goalkeeper',
  'centre_back',
  'full_back',
  'defensive_midfielder',
  'central_midfielder',
  'attacking_midfielder',
  'winger',
  'striker',
]);

export const playerProfileOutputSchema = z.strictObject({
  id: z.uuid().optional(),
  ozId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  /** Titulaire, tuteur, organisation de rattachement, admin. */
  birthDate: z.iso.date().optional(),
  /** Tout autre lecteur : l'année seule. */
  birthYear: z.number().int().optional(),
  nationality: z.string().length(2).optional(),
  country: z.string().length(2).optional(),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  primaryPosition: position.nullable().optional(),
  secondaryPosition: position.nullable().optional(),
  dominantFoot: z.enum(['left', 'right', 'both']).nullable().optional(),
  heightCm: z.number().int().nullable().optional(),
  weightKg: z.number().int().nullable().optional(),
  verificationStatus: z
    .enum(['declared', 'pending', 'in_review', 'verified', 'rejected', 'suspended'])
    .optional(),
  /** Badge : 0 email seul, 1 email et téléphone vérifiés, 2 identité vérifiée. */
  verificationLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  organizationId: z.uuid().nullable().optional(),
  /** Titulaire majeur, tuteur de l'enfant, administrateur seulement (CP-11). */
  phone: z.string().nullable().optional(),
});
export type PlayerProfileOutput = z.infer<typeof playerProfileOutputSchema>;

const blocks = {
  /** Région et ville. */
  location: z.boolean().optional(),
  /** Taille et poids. */
  physical: z.boolean().optional(),
  /** Postes et pied fort. */
  sport: z.boolean().optional(),
};

/** `false` masque le bloc aux tiers ; les blocs absents gardent leur réglage. */
export const playerVisibilityInputSchema = z
  .strictObject(blocks)
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Au moins un bloc à régler.',
  });
export type PlayerVisibilityInput = z.infer<typeof playerVisibilityInputSchema>;

/** Réglage complet après mise à jour ; bloc absent : visible. */
export const playerVisibilityOutputSchema = z.strictObject(blocks);
export type PlayerVisibilityOutput = z.infer<typeof playerVisibilityOutputSchema>;
