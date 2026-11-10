import { z } from 'zod';
import { email, personName } from '../common/fields.js';
import { playerPositionSchema } from './profile.schema.js';

// Inscription joueur (lot 1.7a, EX-107) : une étape = un contrat, revalidé par l'API (C2) et borné
// par la base (C4). La date de naissance est bornée de 6 à 45 ans à chaque couche (EX-107 n° 3).

export const SIGNUP_STEPS = ['identity', 'sport', 'affiliation', 'guardian'] as const;

/** Âges permis à l'inscription, en années révolues (EX-107 n° 3). */
export const SIGNUP_AGE_MIN = 6;
export const SIGNUP_AGE_MAX = 45;
const isoCountry = z.string().regex(/^[A-Z]{2}$/, { error: 'validation.country.invalid' });
const place = z.string().trim().min(1).max(80, { error: 'validation.text.tooLong' });
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, { error: 'validation.phone.invalid' });

/**
 * Âge révolu à la date UTC du jour, comme `ageAt` de `@oz/core` et `oz_age_years` en base (les
 * contrats ne dépendent d'aucun paquet OZ : parité prouvée par `apps/api`, `age-parity.test.ts`).
 */
function ageAt(birthDate: string, today: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) throw new RangeError('Date de naissance AAAA-MM-JJ attendue.');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const anniversary = Date.UTC(today.getUTCFullYear(), month - 1, day);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return today.getUTCFullYear() - year - (now < anniversary ? 1 : 0);
}

/** Âge révolu, ou `null` si la date est mal formée (déjà refusée par le format). */
const safeAge = (value: string): number | null => {
  try {
    return ageAt(value);
  } catch {
    return null;
  }
};

const birthDate = z.iso
  .date({ error: 'validation.birthDate.invalid', abort: true })
  .refine((value) => (safeAge(value) ?? SIGNUP_AGE_MIN) >= SIGNUP_AGE_MIN, {
    error: 'validation.birthDate.tooYoung',
  })
  .refine((value) => (safeAge(value) ?? SIGNUP_AGE_MAX) <= SIGNUP_AGE_MAX, {
    error: 'validation.birthDate.tooOld',
  });

export const signupIdentitySchema = z.strictObject({
  firstName: personName,
  lastName: personName,
  birthDate,
  nationality: isoCountry,
  /** Pays de rattachement : il fixe le préfixe de l'OZ ID. */
  country: isoCountry,
  region: place.optional(),
  city: place.optional(),
});
export type SignupIdentityInput = z.infer<typeof signupIdentitySchema>;

export const signupSportSchema = z
  .strictObject({
    primaryPosition: playerPositionSchema,
    secondaryPosition: playerPositionSchema.optional(),
    dominantFoot: z.enum(['left', 'right', 'both']),
    heightCm: z.number().int().min(80).max(230).optional(),
    weightKg: z.number().int().min(15).max(150).optional(),
  })
  .refine((value) => value.secondaryPosition !== value.primaryPosition, {
    error: 'validation.position.duplicate',
    path: ['secondaryPosition'],
  });
export type SignupSportInput = z.infer<typeof signupSportSchema>;

/** Rattachement (D3) : aucun pour l'instant ; le parrainage par organisation arrive au lot 1.8. */
export const signupAffiliationSchema = z.strictObject({ mode: z.literal('none') });
export type SignupAffiliationInput = z.infer<typeof signupAffiliationSchema>;

export const signupGuardianSchema = z
  .strictObject({
    firstName: personName,
    lastName: personName,
    relationship: z.enum(['mother', 'father', 'legal_guardian', 'other']),
    country: isoCountry,
    phone: phone.optional(),
    email: email.optional(),
  })
  .refine((value) => value.phone !== undefined || value.email !== undefined, {
    error: 'validation.guardian.contactRequired',
    path: ['phone'],
  });
export type SignupGuardianInput = z.infer<typeof signupGuardianSchema>;

export const signupStepParamsSchema = z.strictObject({ step: z.enum(SIGNUP_STEPS) });
export type SignupStepParamsInput = z.infer<typeof signupStepParamsSchema>;

/** Brouillon relu (reprise après interruption, EX-107 n° 2) : étapes enregistrées seulement. */
export const signupStatusOutputSchema = z.strictObject({
  steps: z.strictObject({
    identity: signupIdentitySchema.nullable(),
    sport: signupSportSchema.nullable(),
    affiliation: signupAffiliationSchema.nullable(),
    guardian: signupGuardianSchema.nullable(),
  }),
  /** Calculé par le serveur à partir de la date de naissance enregistrée. */
  minor: z.boolean().nullable(),
  /** Étapes encore requises avant la finalisation, dans l'ordre du parcours. */
  missing: z.array(z.enum(SIGNUP_STEPS)),
  expiresAt: z.iso.datetime().nullable(),
});
export type SignupStatusOutput = z.infer<typeof signupStatusOutputSchema>;

export const signupCompleteOutputSchema = z.strictObject({
  ozId: z.string().regex(/^OZ-[A-Z]{2}-\d{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$/),
  verificationStatus: z.literal('declared'),
  minor: z.boolean(),
  /** Score de complétude du profil, de 0 à 100 (P4, EX-121). */
  completeness: z.number().int().min(0).max(100),
});
export type SignupCompleteOutput = z.infer<typeof signupCompleteOutputSchema>;
