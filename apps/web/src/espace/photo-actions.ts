'use server';

import {
  documentUploadCompleteOutputSchema,
  documentUploadOutputSchema,
  playerPhotosOutputSchema,
  playerProfilePhotoInputSchema,
  type PlayerPhotosOutput,
} from '@oz/contracts';
import { z } from 'zod';
import { checkPiece } from '../guardian/piece';
import { signupFetch } from '../onboarding/signup-api';
import type { ApiResult } from '../session/api-client';

/*
 * Photos de l'espace (lot 1.19cd) : relayées par le serveur du site comme les pièces du tuteur (B1),
 * contrôlées ici (type réel, 10 Mo, empreinte), puis déposées par l'URL signée et réceptionnées par
 * l'API, qui fait analyser, ré-encoder et retirer l'EXIF. Le navigateur ne reçoit qu'une clé.
 */

export type PhotoErrorKey =
  | 'fileType'
  | 'fileSize'
  | 'limit'
  | 'uploadFailed'
  | 'retryLater'
  | 'session'
  | 'notFound'
  | 'unavailable';
export type PhotoFailure = { readonly ok: false; readonly error: PhotoErrorKey };
const failure = (error: PhotoErrorKey): PhotoFailure => ({ ok: false, error });

function fromApi(result: Extract<ApiResult, { ok: false }> | null): PhotoFailure {
  if (result === null || result.status === 401) return failure('session');
  if (result.code === 'PHOTO_LIMIT_REACHED') return failure('limit');
  if (result.code === 'RATE_LIMITED') return failure('retryLater');
  if (result.status === 404) return failure('notFound');
  if (result.status === 422) return failure('fileType');
  return failure('unavailable');
}

type Gallery = { readonly ok: true; readonly gallery: PlayerPhotosOutput } | PhotoFailure;

async function readGallery(): Promise<Gallery> {
  const result = await signupFetch('/players/me/photos', { method: 'GET' });
  if (result === null || !result.ok) return fromApi(result);
  const out = playerPhotosOutputSchema.safeParse(result.data);
  return out.success ? { ok: true, gallery: out.data } : failure('unavailable');
}

export async function listOwnPhotos(): Promise<Gallery> {
  return readGallery();
}

const photoForm = z.object({ playerId: z.uuid(), file: z.instanceof(File) });

/** Une photo : contrôlée ici, envoyée au stockage par l'URL signée, puis réceptionnée par l'API. */
export async function uploadPhoto(form: FormData): Promise<Gallery> {
  const parsed = photoForm.safeParse({ playerId: form.get('playerId'), file: form.get('file') });
  if (!parsed.success) return failure('fileType');
  const bytes = new Uint8Array(await parsed.data.file.arrayBuffer());
  const piece = checkPiece(bytes);
  if (!piece.ok) return failure(piece.error);
  if (piece.contentType === 'application/pdf') return failure('fileType');

  const issued = await signupFetch('/documents/upload', {
    method: 'POST',
    body: {
      documentType: 'photo',
      playerId: parsed.data.playerId,
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
  if (completed === null || !completed.ok) return fromApi(completed);
  if (!documentUploadCompleteOutputSchema.safeParse(completed.data).success) {
    return failure('unavailable');
  }
  return readGallery();
}

export async function chooseProfilePhoto(documentId: unknown): Promise<Gallery> {
  const parsed = playerProfilePhotoInputSchema.safeParse({ documentId });
  if (!parsed.success) return failure('notFound');
  const result = await signupFetch('/players/me/profile-photo', {
    method: 'PUT',
    body: parsed.data,
  });
  if (result === null || !result.ok) return fromApi(result);
  const out = playerPhotosOutputSchema.safeParse(result.data);
  return out.success ? { ok: true, gallery: out.data } : failure('unavailable');
}

export async function removePhoto(documentId: unknown): Promise<Gallery> {
  const id = z.uuid().safeParse(documentId);
  if (!id.success) return failure('notFound');
  const result = await signupFetch(`/players/me/photos/${id.data}`, { method: 'DELETE' });
  if (result === null || !result.ok) return fromApi(result);
  return readGallery();
}
