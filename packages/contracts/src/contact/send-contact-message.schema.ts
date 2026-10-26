import { z } from 'zod';
import { consent, email, longText, personName } from '../common/fields.js';

/** Profils d'inscription (D-K03) et « autre », pour orienter un message de contact. */
export const ORGANISATION_TYPES = [
  'player',
  'guardian',
  'academy',
  'club',
  'federation',
  'performance_center',
  'recruiter',
  'other',
] as const;

/** Formulaire de contact du site public (lot 1.6) — premier contrat partagé (lot 0.5). */
export const sendContactMessageSchema = z.strictObject({
  name: personName,
  email,
  organisationType: z.enum(ORGANISATION_TYPES, { error: 'validation.organisationType.invalid' }),
  message: longText(20, 2_000),
  consent,
});

export type SendContactMessageInput = z.infer<typeof sendContactMessageSchema>;
