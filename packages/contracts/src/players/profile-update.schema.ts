import { z } from 'zod';
import { personName } from '../common/fields.js';
import { playerPositionSchema } from './profile.schema.js';

// Modification de sa fiche (lot 1.19cb, `PATCH /players/me`) : liste blanche de
// `PLAYER_EDITABLE_FIELDS`, moins le pays de rattachement, figé dans l'OZ ID. Un champ absent garde
// sa valeur ; `null` efface un champ facultatif. Prénom, nom et nationalité ne changent qu'au statut
// `declared` (décision U3 du 2026-11-19) : la base le redécide.

const isoCountry = z.string().regex(/^[A-Z]{2}$/, { error: 'validation.country.invalid' });
const place = z.string().trim().min(1).max(80, { error: 'validation.text.tooLong' });

/** Champs d'identité figés dès que l'identité est examinée ou vérifiée (U3). */
export const PLAYER_IDENTITY_FIELDS = ['firstName', 'lastName', 'nationality'] as const;

export const playerProfileUpdateInputSchema = z
  .strictObject({
    firstName: personName.optional(),
    lastName: personName.optional(),
    nationality: isoCountry.optional(),
    region: place.nullable().optional(),
    city: place.nullable().optional(),
    primaryPosition: playerPositionSchema.optional(),
    secondaryPosition: playerPositionSchema.nullable().optional(),
    dominantFoot: z.enum(['left', 'right', 'both']).optional(),
    heightCm: z.number().int().min(80).max(230).nullable().optional(),
    weightKg: z.number().int().min(15).max(150).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'validation.profile.empty',
  })
  .refine(
    (value) =>
      value.secondaryPosition === undefined ||
      value.secondaryPosition === null ||
      value.secondaryPosition !== value.primaryPosition,
    { error: 'validation.position.duplicate', path: ['secondaryPosition'] },
  );
export type PlayerProfileUpdateInput = z.infer<typeof playerProfileUpdateInputSchema>;
