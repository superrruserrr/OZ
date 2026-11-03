import { z } from 'zod';
import { secondFactorCodeSchema } from '../auth/auth.schema.js';
import { currentPassword } from '../common/fields.js';

// Export des données personnelles (lot 1.16ba, EX-118 n° 2) : demande ré-authentifiée (D2) et suivi
// de la dernière demande. L'archive elle-même (URL signée) arrive au lot 1.16bb.

/** Mot de passe, plus le code TOTP ou de secours si la 2FA est active (D2). */
export const dataExportRequestInputSchema = z.strictObject({
  password: currentPassword,
  code: secondFactorCodeSchema.optional(),
});
export type DataExportRequestInput = z.infer<typeof dataExportRequestInputSchema>;

export const DATA_EXPORT_STATUSES = [
  'pending',
  'processing',
  'ready',
  'failed',
  'expired',
] as const;

export const dataExportOutputSchema = z.strictObject({
  status: z.enum(DATA_EXPORT_STATUSES),
  requestedAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  /** Instant à partir duquel une nouvelle demande sera acceptée (D3). */
  nextRequestAt: z.iso.datetime(),
});
export type DataExportOutput = z.infer<typeof dataExportOutputSchema>;

/** Suivi : la dernière demande, ou `null` si le compte n'en a jamais fait. */
export const dataExportStatusOutputSchema = z.strictObject({
  latest: dataExportOutputSchema.nullable(),
});
export type DataExportStatusOutput = z.infer<typeof dataExportStatusOutputSchema>;
