import { z } from 'zod';
import { oneTimeToken } from '../common/fields.js';

// Tuteur légal (lot 1.7ba, EX-108) : invitation émise par le joueur mineur, acceptée par le compte
// du tuteur. Aucune donnée de l'enfant au-delà du prénom avant l'acceptation.

const relationship = z.enum(['mother', 'father', 'legal_guardian', 'other']);

/**
 * Invitation émise. `email` : OZ a envoyé le lien au tuteur. `link` : le tuteur n'a donné qu'un
 * téléphone, le joueur transmet lui-même le lien rendu ici (une seule fois).
 */
export const guardianInvitationOutputSchema = z.discriminatedUnion('channel', [
  z.strictObject({ channel: z.literal('email') }),
  z.strictObject({ channel: z.literal('link'), link: z.string().max(500) }),
]);
export type GuardianInvitationOutput = z.infer<typeof guardianInvitationOutputSchema>;

/** Jeton du lien d'invitation (`…/tuteur/invitation#token=…`), lu par le site dans le fragment. */
export const guardianInvitationTokenSchema = z.strictObject({ token: oneTimeToken });
export type GuardianInvitationTokenInput = z.infer<typeof guardianInvitationTokenSchema>;

export const guardianInvitationPreviewOutputSchema = z.strictObject({
  childFirstName: z.string(),
  relationship,
});
export type GuardianInvitationPreviewOutput = z.infer<typeof guardianInvitationPreviewOutputSchema>;

/** Rattachement fait ; la fiche de l'enfant ne s'ouvre au tuteur qu'après sa vérification. */
export const guardianInvitationAcceptOutputSchema = z.strictObject({
  status: z.literal('accepted'),
});
export type GuardianInvitationAcceptOutput = z.infer<typeof guardianInvitationAcceptOutputSchema>;

export const guardianChildrenOutputSchema = z.strictObject({
  children: z.array(
    z.strictObject({
      /** Tuteur vérifié pour cet enfant : condition de ses droits sur la fiche. */
      guardianVerified: z.boolean(),
      /** Absent (`null`) tant que le tuteur n'est pas vérifié. */
      ozId: z.string().nullable(),
      firstName: z.string(),
      /** Absent (`null`) tant que le tuteur n'est pas vérifié. */
      lastName: z.string().nullable(),
      verificationStatus: z.enum([
        'declared',
        'pending',
        'in_review',
        'verified',
        'rejected',
        'suspended',
      ]),
      /** Fiche visible des tiers : exige le consentement d'un tuteur vérifié (EX-T16 n° 3). */
      published: z.boolean(),
    }),
  ),
});
export type GuardianChildrenOutput = z.infer<typeof guardianChildrenOutputSchema>;
