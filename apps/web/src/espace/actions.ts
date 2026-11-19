'use server';

import {
  accountDeletionOutputSchema,
  accountDeletionRequestInputSchema,
  dataExportDownloadOutputSchema,
  dataExportOutputSchema,
  dataExportRequestInputSchema,
  playerVisibilityInputSchema,
  playerVisibilityOutputSchema,
  type AccountDeletionOutput,
  type DataExportOutput,
  type PlayerVisibilityOutput,
} from '@oz/contracts';
import { z } from 'zod';
import { signupFetch } from '../onboarding/signup-api';
import type { ApiResult } from '../session/api-client';

/*
 * Actions serveur de l'espace du joueur (lot 1.19b, ADR-010) : visibilité, export et suppression du
 * compte. Le navigateur ne reçoit qu'une clé de message (`espace.errors.*`) et les données utiles à
 * l'écran ; jamais un jeton, un message de l'API ni le mot de passe saisi.
 */

export type EspaceErrorKey =
  | 'invalid'
  | 'reauth'
  | 'tooSoon'
  | 'active'
  | 'pending'
  | 'notFound'
  | 'retryLater'
  | 'session'
  | 'unavailable';

export type EspaceFailure = {
  readonly ok: false;
  readonly error: EspaceErrorKey;
  readonly retryAfterSeconds?: number;
};

const CODES: Readonly<Record<string, EspaceErrorKey>> = {
  RATE_LIMITED: 'retryLater',
  VALIDATION_FAILED: 'invalid',
  DATA_EXPORT_REJECTED: 'reauth',
  ACCOUNT_DELETION_REJECTED: 'reauth',
  DATA_EXPORT_TOO_SOON: 'tooSoon',
  DATA_EXPORT_ACTIVE: 'active',
  ACCOUNT_DELETION_PENDING: 'pending',
  DATA_EXPORT_NOT_FOUND: 'notFound',
  ACCOUNT_DELETION_NOT_FOUND: 'notFound',
};

const failure = (error: EspaceErrorKey): EspaceFailure => ({ ok: false, error });

function fromApi(result: Extract<ApiResult, { ok: false }> | null): EspaceFailure {
  if (result === null) return failure('session');
  const error =
    CODES[result.code] ??
    (result.status === 401
      ? 'session'
      : result.status === 400 || result.status === 422
        ? 'invalid'
        : 'unavailable');
  return result.retryAfterSeconds === undefined
    ? { ok: false, error }
    : { ok: false, error, retryAfterSeconds: result.retryAfterSeconds };
}

const ozIdSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);

export async function saveVisibility(
  ozId: unknown,
  input: unknown,
): Promise<{ readonly ok: true; readonly visibility: PlayerVisibilityOutput } | EspaceFailure> {
  const id = ozIdSchema.safeParse(ozId);
  const parsed = playerVisibilityInputSchema.safeParse(input);
  if (!id.success || !parsed.success) return failure('invalid');
  const result = await signupFetch(`/players/${id.data}/visibility`, {
    method: 'PATCH',
    body: parsed.data,
  });
  if (result === null || !result.ok) return fromApi(result);
  const out = playerVisibilityOutputSchema.safeParse(result.data);
  return out.success ? { ok: true, visibility: out.data } : failure('unavailable');
}

export async function requestExport(
  input: unknown,
): Promise<{ readonly ok: true; readonly latest: DataExportOutput } | EspaceFailure> {
  const parsed = dataExportRequestInputSchema.safeParse(input);
  if (!parsed.success) return failure('invalid');
  const result = await signupFetch('/account/data-export', { method: 'POST', body: parsed.data });
  if (result === null || !result.ok) return fromApi(result);
  const out = dataExportOutputSchema.safeParse(result.data);
  return out.success ? { ok: true, latest: out.data } : failure('unavailable');
}

/** URL signée de 5 minutes, ouverte aussitôt par le navigateur (jamais conservée). */
export async function exportDownloadUrl(): Promise<
  { readonly ok: true; readonly url: string } | EspaceFailure
> {
  const result = await signupFetch('/account/data-export/download', { method: 'GET' });
  if (result === null || !result.ok) return fromApi(result);
  const out = dataExportDownloadOutputSchema.safeParse(result.data);
  return out.success ? { ok: true, url: out.data.url } : failure('unavailable');
}

export async function requestDeletion(
  input: unknown,
): Promise<{ readonly ok: true; readonly pending: AccountDeletionOutput } | EspaceFailure> {
  const parsed = accountDeletionRequestInputSchema.safeParse(input);
  if (!parsed.success) return failure('invalid');
  const result = await signupFetch('/account/deletion', { method: 'POST', body: parsed.data });
  if (result === null || !result.ok) return fromApi(result);
  const out = accountDeletionOutputSchema.safeParse(result.data);
  return out.success ? { ok: true, pending: out.data } : failure('unavailable');
}

export async function cancelDeletion(): Promise<{ readonly ok: true } | EspaceFailure> {
  const result = await signupFetch('/account/deletion', { method: 'DELETE' });
  if (result === null || !result.ok) return fromApi(result);
  return { ok: true };
}
