import { z } from 'zod';
import { secondFactorCodeSchema } from '../auth/auth.schema.js';
import { currentPassword, oneTimeToken } from '../common/fields.js';

// Tuteur légal (lot 1.7ba, EX-108) : invitation émise par le joueur mineur, acceptée par le compte
// du tuteur. Aucune donnée de l'enfant au-delà du prénom avant l'acceptation.

const relationship = z.enum(['mother', 'father', 'legal_guardian', 'other']);
const verificationStatus = z.enum([
  'declared',
  'pending',
  'in_review',
  'verified',
  'rejected',
  'suspended',
]);
/** Consentements donnés par un tuteur pour un enfant (lot 1.7bb). */
export const GUARDIAN_CONSENT_TYPES = [
  'guardian_data_processing',
  'guardian_profile_publication',
] as const;
const guardianConsentType = z.enum(GUARDIAN_CONSENT_TYPES, {
  error: 'validation.guardian.consent',
});

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
      /** Fiche tuteur de ce rattachement : cible des pièces du justificatif (lot 1.7bb). */
      guardianId: z.uuid(),
      /** Tuteur vérifié (KYC 2) pour cet enfant : condition de ses droits sur la fiche. */
      guardianVerified: z.boolean(),
      /** Pièces attendues, en revue, refusées, ou lien approuvé par OZ (lot 1.7bb). */
      linkStatus: z.enum(['awaiting_documents', 'submitted', 'rejected', 'approved']),
      /** Absent (`null`) tant que le lien n'est pas approuvé. */
      ozId: z.string().nullable(),
      firstName: z.string(),
      /** Absent (`null`) tant que le lien n'est pas approuvé. */
      lastName: z.string().nullable(),
      verificationStatus: verificationStatus,
      /** Fiche visible des tiers : exige le consentement d'un tuteur vérifié (EX-T16 n° 3). */
      published: z.boolean(),
      /** Consentements actifs donnés par ce compte pour cet enfant. */
      consents: z.array(guardianConsentType),
    }),
  ),
});
export type GuardianChildrenOutput = z.infer<typeof guardianChildrenOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Lot 1.7bb (EX-108 n° 2 à 5) : justificatif du lien, revue par OZ, consentement révocable.
// ---------------------------------------------------------------------------------------------

/** Dépôt du justificatif : 1 à 3 pièces déjà déposées et saines, sur la fiche tuteur. */
export const guardianLinkSubmitSchema = z.strictObject({
  guardianId: z.uuid({ error: 'validation.guardian.link' }),
  documentIds: z
    .array(z.uuid({ error: 'validation.guardian.documents' }))
    .min(1, { error: 'validation.guardian.documents' })
    .max(3, { error: 'validation.guardian.documents' }),
});
export type GuardianLinkSubmitInput = z.infer<typeof guardianLinkSubmitSchema>;

export const guardianLinkSubmitOutputSchema = z.strictObject({
  status: z.literal('submitted'),
});
export type GuardianLinkSubmitOutput = z.infer<typeof guardianLinkSubmitOutputSchema>;

export const GUARDIAN_LINK_REJECTION_REASONS = [
  'illegible',
  'name_mismatch',
  'child_mismatch',
  'wrong_document',
  'suspected_forgery',
] as const;

export const guardianLinkQueueQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type GuardianLinkQueueQueryInput = z.input<typeof guardianLinkQueueQuerySchema>;
export type GuardianLinkQueueQueryOutput = z.output<typeof guardianLinkQueueQuerySchema>;

/** File de revue (administrateur) : de quoi comparer les pièces à la déclaration. */
export const guardianLinkQueueOutputSchema = z.strictObject({
  reviews: z.array(
    z.strictObject({
      reviewId: z.uuid(),
      submittedAt: z.iso.datetime(),
      relationship,
      guardianFirstName: z.string(),
      guardianLastName: z.string(),
      childFirstName: z.string(),
      childLastName: z.string(),
      childBirthDate: z.iso.date(),
      rejections: z.number().int().min(0),
      /** À lire par `GET /documents/:id/url` (URL signée de 5 minutes, auditée). */
      documentIds: z.array(z.uuid()),
    }),
  ),
});
export type GuardianLinkQueueOutput = z.infer<typeof guardianLinkQueueOutputSchema>;

export const guardianLinkReviewParamsSchema = z.strictObject({ id: z.uuid() });
export type GuardianLinkReviewParamsInput = z.infer<typeof guardianLinkReviewParamsSchema>;

/** Décision ré-authentifiée : mot de passe, et code si la 2FA est active. Motif si refus. */
export const guardianLinkDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal('approve'),
    password: currentPassword,
    code: secondFactorCodeSchema.optional(),
  }),
  z.strictObject({
    decision: z.literal('reject'),
    reason: z.enum(GUARDIAN_LINK_REJECTION_REASONS, { error: 'validation.guardian.reason' }),
    password: currentPassword,
    code: secondFactorCodeSchema.optional(),
  }),
]);
export type GuardianLinkDecisionInput = z.infer<typeof guardianLinkDecisionSchema>;

export const guardianLinkDecisionOutputSchema = z.strictObject({
  status: z.enum(['approved', 'rejected']),
  /** Rattachement clos (3e refus ou faux suspecté) : l'enfant doit réinviter. */
  closed: z.boolean(),
});
export type GuardianLinkDecisionOutput = z.infer<typeof guardianLinkDecisionOutputSchema>;

export const consentTextParamsSchema = z.strictObject({ type: guardianConsentType });
export type ConsentTextParamsInput = z.infer<typeof consentTextParamsSchema>;

/** Texte en vigueur : à présenter tel quel, puis à renvoyer par sa version et son empreinte. */
export const consentTextOutputSchema = z.strictObject({
  type: guardianConsentType,
  version: z.string(),
  body: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  publishedAt: z.iso.datetime(),
});
export type ConsentTextOutput = z.infer<typeof consentTextOutputSchema>;

export const guardianConsentParamsSchema = z.strictObject({
  ozId: z.string().min(1).max(32),
});
export type GuardianConsentParamsInput = z.infer<typeof guardianConsentParamsSchema>;

export const guardianConsentRevokeParamsSchema = z.strictObject({
  ozId: z.string().min(1).max(32),
  type: guardianConsentType,
});
export type GuardianConsentRevokeParamsInput = z.infer<typeof guardianConsentRevokeParamsSchema>;

/** Consentement : le texte lu (version et empreinte) ; acte ré-authentifié. */
export const guardianConsentGrantSchema = z.strictObject({
  type: guardianConsentType,
  textVersion: z.string().min(1).max(50),
  textSha256: z.string().regex(/^[0-9a-f]{64}$/, { error: 'validation.guardian.consentText' }),
  password: currentPassword,
  code: secondFactorCodeSchema.optional(),
});
export type GuardianConsentGrantInput = z.infer<typeof guardianConsentGrantSchema>;

export const guardianConsentOutputSchema = z.strictObject({
  type: guardianConsentType,
  textVersion: z.string(),
  /** Heure de la base, jamais celle du client. */
  grantedAt: z.iso.datetime(),
});
export type GuardianConsentOutput = z.infer<typeof guardianConsentOutputSchema>;

export const guardianConsentRevokeOutputSchema = z.strictObject({
  /** Consentements retirés (0 : rien d'actif) ; retirer le traitement retire la publication. */
  revoked: z.number().int().min(0),
});
export type GuardianConsentRevokeOutput = z.infer<typeof guardianConsentRevokeOutputSchema>;
