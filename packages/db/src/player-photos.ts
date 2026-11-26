// Photos du joueur (lot 1.19cd, U1 et U2) : appels typés à la migration 20261124100000_player_photos.
// L'API lit d'abord la fiche sous la RLS du lecteur et décide (CASL, bloc `photos`) ; ces fonctions ne
// rendent jamais une donnée extraite d'une pièce, seulement identifiant, clé et dimensions.

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Six photos au plus par joueur (U2), photo de profil comprise ; redécidé par la base. */
export const PLAYER_PHOTO_LIMIT = 6;

export type PlayerPhotoStatus = 'pending' | 'clean' | 'rejected' | 'infected';

export interface PlayerPhoto {
  readonly id: string;
  /** `clean/<id>` une fois saine ; jamais servie avant. */
  readonly storageKey: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly status: PlayerPhotoStatus;
  readonly isProfile: boolean;
  readonly createdAt: Date;
}

interface PhotoRow {
  id: string;
  storage_key: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  av_status: PlayerPhotoStatus;
  is_profile: boolean;
  created_at: Date;
}

/** Photos actives d'un joueur déjà lu par l'appelant, photo de profil d'abord. */
export async function playerPhotos(
  tx: TransactionClient,
  playerId: string,
): Promise<PlayerPhoto[]> {
  if (!UUID.test(playerId)) return [];
  const rows = await tx.$queryRaw<PhotoRow[]>`
    SELECT id::text, storage_key, mime_type, width, height, av_status::text AS av_status,
      is_profile, created_at FROM oz_player_photos(${playerId}::uuid)`;
  return rows.map((row) => ({
    id: row.id,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    status: row.av_status,
    isProfile: row.is_profile,
    createdAt: row.created_at,
  }));
}

/**
 * Choisit (ou retire, `null`) la photo de profil : titulaire majeur ou tuteur vérifié d'un mineur,
 * redécidé et audité par la base. `false` : sans droit ; la base refuse une photo non saine.
 */
export async function setPlayerProfilePhoto(
  tx: TransactionClient,
  playerId: string,
  documentId: string | null,
): Promise<boolean> {
  if (!UUID.test(playerId) || (documentId !== null && !UUID.test(documentId))) return false;
  const rows = await tx.$queryRaw<{ ok: boolean | null }[]>`
    SELECT oz_player_set_profile_photo(${playerId}::uuid, ${documentId}::uuid) AS ok`;
  return rows[0]?.ok === true;
}

/** Retire une photo (suppression logique, purge à suivre) ; `false` : inconnue ou sans droit. */
export async function removePlayerPhoto(
  tx: TransactionClient,
  playerId: string,
  documentId: string,
): Promise<boolean> {
  if (!UUID.test(playerId) || !UUID.test(documentId)) return false;
  const rows = await tx.$queryRaw<{ ok: boolean | null }[]>`
    SELECT oz_player_remove_photo(${playerId}::uuid, ${documentId}::uuid) AS ok`;
  return rows[0]?.ok === true;
}
