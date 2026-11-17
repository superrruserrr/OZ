'use server';

import {
  documentUploadCompleteOutputSchema,
  documentUploadOutputSchema,
  guardianConsentGrantSchema,
  guardianConsentRevokeOutputSchema,
  guardianInvitationOutputSchema,
  guardianInvitationPreviewOutputSchema,
  guardianInvitationTokenSchema,
  guardianLinkSubmitSchema,
  type GuardianInvitationPreviewOutput,
} from '@oz/contracts';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { signupFetch } from '../onboarding/signup-api';
import { apiFetch, type ApiResult } from '../session/api-client';
import { clientContext } from '../session/client-context';
import {
  cookie,
  GUARDIAN_INVITE_COOKIE,
  GUARDIAN_INVITE_MAX_AGE,
  writeCookies,
} from '../session/cookies';
import { checkPiece } from './piece';

/*
 * Actions serveur du tuteur légal (lot 1.7bc, ADR-010). Le navigateur ne reçoit qu'une clé de
 * message (`guardian.errors.*`) et les données utiles à l'écran : jamais un jeton de session, un
 * message de l'API, une URL de stockage ni le mot de passe saisi.
 */

export type GuardianErrorKey =
  | 'invalid'
  | 'retryLater'
  | 'unavailable'
  /** Session expirée ou absente : l'écran recharge, `proxy.ts` renvoie à la connexion. */
  | 'session'
  | 'notApplicable'
  | 'invitationInvalid'
  | 'self'
  | 'refused'
  | 'alreadySubmitted'
  | 'invalidDocuments'
  | 'orderRequired'
  | 'linkNotFound'
  | 'reauth'
  | 'textStale'
  | 'requiresDataProcessing'
  | 'fileSize'
  | 'fileType'
  | 'uploadFailed';

export type GuardianFailure = {
  readonly ok: false;
  readonly error: GuardianErrorKey;
  readonly retryAfterSeconds?: number;
};

const failure = (error: GuardianErrorKey): GuardianFailure => ({ ok: false, error });

const CODES: Readonly<Record<string, GuardianErrorKey>> = {
  RATE_LIMITED: 'retryLater',
  VALIDATION_FAILED: 'invalid',
  GUARDIAN_INVITATION_NOT_APPLICABLE: 'notApplicable',
  GUARDIAN_INVITATION_INVALID: 'invitationInvalid',
  GUARDIAN_SELF: 'self',
  GUARDIAN_REFUSED: 'refused',
  GUARDIAN_LINK_ALREADY_SUBMITTED: 'alreadySubmitted',
  GUARDIAN_LINK_INVALID_DOCUMENTS: 'invalidDocuments',
  GUARDIAN_LINK_ORDER_REQUIRED: 'orderRequired',
  GUARDIAN_LINK_NOT_FOUND: 'linkNotFound',
  GUARDIAN_REAUTH_REJECTED: 'reauth',
  CONSENT_TEXT_STALE: 'textStale',
  CONSENT_REQUIRES_DATA_PROCESSING: 'requiresDataProcessing',
};

function fromApi(result: Extract<ApiResult, { ok: false }> | null): GuardianFailure {
  if (result === null) return failure('session');
  const error =
    CODES[result.code] ??
    (result.status === 401
      ? 'session'
      : result.status === 404
        ? 'linkNotFound'
        : result.status === 400 || result.status === 422
          ? 'invalid'
          : 'unavailable');
  return result.retryAfterSeconds === undefined
    ? { ok: false, error }
    : { ok: false, error, retryAfterSeconds: result.retryAfterSeconds };
}

// --------------------------------------------------------------------------------------------
// Joueur mineur : inviter son tuteur (EX-108 n° 1, D1).
// --------------------------------------------------------------------------------------------

export type InviteResult =
  | { readonly ok: true; readonly channel: 'email' }
  /** Lien rendu une seule fois, à transmettre soi-même (tuteur sans adresse email, D-134). */
  | { readonly ok: true; readonly channel: 'link'; readonly link: string }
  | GuardianFailure;

export async function inviteGuardian(): Promise<InviteResult> {
  const result = await signupFetch('/players/me/guardian/invitation', { method: 'POST' });
  if (result === null || !result.ok) return fromApi(result);
  const parsed = guardianInvitationOutputSchema.safeParse(result.data);
  if (!parsed.success) return failure('unavailable');
  return parsed.data.channel === 'email'
    ? { ok: true, channel: 'email' }
    : { ok: true, channel: 'link', link: parsed.data.link };
}

// --------------------------------------------------------------------------------------------
// Tuteur : invitation (aperçu sans compte, puis acceptation connecté), jeton gardé en cookie (B4).
// --------------------------------------------------------------------------------------------

/** `__Host-` : l'effacement doit garder Secure et Path=/, sinon le navigateur l'ignore. */
function forgetInvitation(jar: Awaited<ReturnType<typeof cookies>>): void {
  writeCookies(jar, [cookie(GUARDIAN_INVITE_COOKIE, '', 0)]);
}

export type PreviewResult =
  { readonly ok: true; readonly preview: GuardianInvitationPreviewOutput } | GuardianFailure;

async function preview(token: string): Promise<PreviewResult> {
  const result = await apiFetch('/guardians/invitations/read', {
    method: 'POST',
    body: { token },
    client: await clientContext(),
  });
  if (!result.ok) return fromApi(result);
  const parsed = guardianInvitationPreviewOutputSchema.safeParse(result.data);
  return parsed.success ? { ok: true, preview: parsed.data } : failure('unavailable');
}

/** Jeton lu dans le fragment par la page : aperçu, puis gardé pour la connexion ou l'inscription. */
export async function openInvitation(token: unknown): Promise<PreviewResult> {
  const parsed = guardianInvitationTokenSchema.safeParse({ token });
  if (!parsed.success) return failure('invitationInvalid');
  const read = await preview(parsed.data.token);
  const jar = await cookies();
  if (read.ok) {
    writeCookies(jar, [cookie(GUARDIAN_INVITE_COOKIE, parsed.data.token, GUARDIAN_INVITE_MAX_AGE)]);
  } else if (read.error === 'invitationInvalid') {
    forgetInvitation(jar);
  }
  return read;
}

/** Retour sur la page sans fragment (après connexion) : aperçu de l'invitation gardée. */
export async function readKeptInvitation(): Promise<PreviewResult> {
  const token = (await cookies()).get(GUARDIAN_INVITE_COOKIE)?.value;
  const parsed = guardianInvitationTokenSchema.safeParse({ token });
  if (!parsed.success) return failure('invitationInvalid');
  return preview(parsed.data.token);
}

export async function acceptInvitation(): Promise<{ readonly ok: true } | GuardianFailure> {
  const jar = await cookies();
  const parsed = guardianInvitationTokenSchema.safeParse({
    token: jar.get(GUARDIAN_INVITE_COOKIE)?.value,
  });
  if (!parsed.success) return failure('invitationInvalid');
  const result = await signupFetch('/guardians/invitations/accept', {
    method: 'POST',
    body: { token: parsed.data.token },
  });
  if (result === null || !result.ok) {
    const failed = fromApi(result);
    // Jeton usé, expiré ou refusé pour ce compte : il ne resservira pas.
    if (failed.error === 'invitationInvalid' || failed.error === 'self') {
      forgetInvitation(jar);
    }
    return failed;
  }
  forgetInvitation(jar);
  return { ok: true };
}

// --------------------------------------------------------------------------------------------
// Justificatif de lien (EX-108 n° 2, R3) : pièces relayées par le serveur du site (B1).
// --------------------------------------------------------------------------------------------

const pieceForm = z.object({
  guardianId: z.uuid(),
  documentType: z.enum(['birth_certificate', 'guardianship_order']),
  file: z.instanceof(File),
});

/** Une pièce : contrôlée ici, envoyée au stockage par l'URL signée, puis réceptionnée par l'API. */
export async function uploadPiece(
  form: FormData,
): Promise<{ readonly ok: true; readonly documentId: string } | GuardianFailure> {
  const parsed = pieceForm.safeParse({
    guardianId: form.get('guardianId'),
    documentType: form.get('documentType'),
    file: form.get('file'),
  });
  if (!parsed.success) return failure('invalid');
  const { guardianId, documentType, file } = parsed.data;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const piece = checkPiece(bytes);
  if (!piece.ok) return failure(piece.error);

  const issued = await signupFetch('/documents/upload', {
    method: 'POST',
    body: {
      documentType,
      guardianId,
      contentType: piece.contentType,
      sizeBytes: piece.sizeBytes,
      sha256: piece.sha256,
    },
  });
  if (issued === null || !issued.ok) return fromApi(issued);
  const target = documentUploadOutputSchema.safeParse(issued.data);
  if (!target.success) return failure('unavailable');

  try {
    const stored = await fetch(target.data.url, {
      method: 'PUT',
      headers: target.data.headers,
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!stored.ok) return failure('uploadFailed');
  } catch {
    return failure('uploadFailed');
  }

  const completed = await signupFetch(`/documents/upload/${target.data.uploadId}/complete`, {
    method: 'POST',
  });
  if (completed === null || !completed.ok) {
    return completed !== null && completed.status === 422
      ? failure('fileType')
      : fromApi(completed);
  }
  const done = documentUploadCompleteOutputSchema.safeParse(completed.data);
  return done.success ? { ok: true, documentId: done.data.documentId } : failure('unavailable');
}

export async function submitLink(input: unknown): Promise<{ readonly ok: true } | GuardianFailure> {
  const parsed = guardianLinkSubmitSchema.safeParse(input);
  if (!parsed.success) return failure('invalid');
  const result = await signupFetch('/guardians/link/submit', { method: 'POST', body: parsed.data });
  if (result === null || !result.ok) return fromApi(result);
  return { ok: true };
}

// --------------------------------------------------------------------------------------------
// Accords (EX-108 n° 3 à 5, CP-13) : ré-authentifiés pour consentir, simples à retirer.
// --------------------------------------------------------------------------------------------

const ozIdSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);

export async function grantConsent(
  ozId: unknown,
  input: unknown,
): Promise<{ readonly ok: true } | GuardianFailure> {
  const id = ozIdSchema.safeParse(ozId);
  const parsed = guardianConsentGrantSchema.safeParse(input);
  if (!id.success || !parsed.success) return failure('invalid');
  const result = await signupFetch(`/guardians/me/children/${id.data}/consents`, {
    method: 'POST',
    body: parsed.data,
  });
  if (result === null || !result.ok) return fromApi(result);
  return { ok: true };
}

export async function revokeConsent(
  ozId: unknown,
  type: unknown,
): Promise<{ readonly ok: true; readonly revoked: number } | GuardianFailure> {
  const id = ozIdSchema.safeParse(ozId);
  const kind = z.enum(['guardian_data_processing', 'guardian_profile_publication']).safeParse(type);
  if (!id.success || !kind.success) return failure('invalid');
  const result = await signupFetch(`/guardians/me/children/${id.data}/consents/${kind.data}`, {
    method: 'DELETE',
  });
  if (result === null || !result.ok) return fromApi(result);
  const parsed = guardianConsentRevokeOutputSchema.safeParse(result.data);
  return parsed.success ? { ok: true, revoked: parsed.data.revoked } : failure('unavailable');
}
