import { z } from 'zod';
import { secondFactorCodeSchema } from '../auth/auth.schema.js';
import { currentPassword } from '../common/fields.js';

// Suppression du compte (lot 1.16ca, EX-118 n° 3) : demande ré-authentifiée, délai de rétractation
// de 30 jours (D1) pendant lequel le titulaire peut se reconnecter et annuler.

/** Mot de passe, plus le code TOTP ou de secours si la 2FA est active. */
export const accountDeletionRequestInputSchema = z.strictObject({
  password: currentPassword,
  code: secondFactorCodeSchema.optional(),
});
export type AccountDeletionRequestInput = z.infer<typeof accountDeletionRequestInputSchema>;

/** Demande en attente : l'anonymisation a lieu à `scheduledFor`, sauf annulation avant. */
export const accountDeletionOutputSchema = z.strictObject({
  requestedAt: z.iso.datetime(),
  scheduledFor: z.iso.datetime(),
});
export type AccountDeletionOutput = z.infer<typeof accountDeletionOutputSchema>;

/** Suivi : la demande en attente, ou `null` s'il n'y en a pas. */
export const accountDeletionStatusOutputSchema = z.strictObject({
  pending: accountDeletionOutputSchema.nullable(),
});
export type AccountDeletionStatusOutput = z.infer<typeof accountDeletionStatusOutputSchema>;
