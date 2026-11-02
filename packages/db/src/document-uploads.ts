// Intentions de dépôt (lot 1.9a) : appels typés à la migration 20261103100000_document_uploads, sous
// le contexte RLS de l'utilisateur (`withUserContext`). La réception et le rejet passent par les
// fonctions privilégiées, qui contrôlent elles-mêmes le demandeur (D-059).

import { playerRecord } from './players.js';
import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadDocumentType =
  | 'birth_certificate'
  | 'identity_document'
  | 'photo'
  | 'license'
  | 'video'
  | 'organization_registration';

export type UploadTarget =
  | { readonly playerId: string }
  | { readonly guardianId: string }
  | { readonly organizationId: string };

export interface NewDocumentUpload {
  readonly documentType: UploadDocumentType;
  readonly target: UploadTarget;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface DocumentUploadRow {
  readonly id: string;
  readonly status: 'issued' | 'completed' | 'rejected' | 'expired';
  readonly documentType: UploadDocumentType;
  readonly target: UploadTarget;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly expiresAt: Date;
  /** Échéance passée à l'horloge de la base, jamais à celle de l'API. */
  readonly expired: boolean;
}

export type CompleteOutcome =
  | { readonly outcome: 'completed'; readonly documentId: string }
  | { readonly outcome: 'not_found' | 'already_used' | 'expired'; readonly documentId: null };

export type RejectReason = 'size_mismatch' | 'type_mismatch';

function targetColumns(target: UploadTarget): [string | null, string | null, string | null] {
  if ('playerId' in target) return [target.playerId, null, null];
  if ('guardianId' in target) return [null, target.guardianId, null];
  return [null, null, target.organizationId];
}

/**
 * Crée l'intention si la cible est visible du demandeur (RLS) ; `null` sinon, sans rien révéler.
 * Les bornes (taille, empreinte, type) sont vérifiées par la base.
 */
export async function createDocumentUpload(
  tx: TransactionClient,
  input: NewDocumentUpload,
): Promise<{ id: string; expiresAt: Date } | null> {
  const [playerId, guardianId, organizationId] = targetColumns(input.target);
  for (const id of [playerId, guardianId, organizationId]) {
    if (id !== null && !UUID.test(id)) return null;
  }
  const rows = await tx.$queryRaw<{ id: string; expires_at: Date }[]>`
    INSERT INTO document_uploads (requested_by, document_type, player_id, guardian_id, organization_id,
      content_type, size_bytes, sha256)
    SELECT oz_current_user_id(), ${input.documentType}::document_type, ${playerId}::uuid,
      ${guardianId}::uuid, ${organizationId}::uuid, ${input.contentType}, ${input.sizeBytes}::bigint,
      ${input.sha256}
    WHERE EXISTS (SELECT 1 FROM players WHERE id = ${playerId}::uuid)
       OR EXISTS (SELECT 1 FROM guardians WHERE id = ${guardianId}::uuid)
       OR EXISTS (SELECT 1 FROM organizations WHERE id = ${organizationId}::uuid)
    RETURNING id::text, expires_at`;
  const row = rows[0];
  return row === undefined ? null : { id: row.id, expiresAt: row.expires_at };
}

/** Intention du demandeur courant ; `null` si elle n'est pas la sienne, inconnue ou mal formée. */
export async function documentUploadFor(
  tx: TransactionClient,
  uploadId: string,
): Promise<DocumentUploadRow | null> {
  if (!UUID.test(uploadId)) return null;
  const rows = await tx.$queryRaw<
    {
      id: string;
      status: DocumentUploadRow['status'];
      document_type: UploadDocumentType;
      player_id: string | null;
      guardian_id: string | null;
      organization_id: string | null;
      content_type: string;
      size_bytes: bigint;
      sha256: string;
      expires_at: Date;
      expired: boolean;
    }[]
  >`
    SELECT id::text, status::text AS status, document_type::text AS document_type,
      player_id::text, guardian_id::text, organization_id::text, content_type, size_bytes, sha256,
      expires_at, expires_at <= now() AS expired
    FROM document_uploads WHERE id = ${uploadId}::uuid`;
  const row = rows[0];
  if (row === undefined) return null;
  const target: UploadTarget =
    row.player_id !== null
      ? { playerId: row.player_id }
      : row.guardian_id !== null
        ? { guardianId: row.guardian_id }
        : { organizationId: row.organization_id ?? '' };
  return {
    id: row.id,
    status: row.status,
    documentType: row.document_type,
    target,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    expiresAt: row.expires_at,
    expired: row.expired,
  };
}

/** Réception : une seule fois, avant échéance ; crée le document `pending` (D2, D6). */
export async function completeDocumentUpload(
  tx: TransactionClient,
  uploadId: string,
  retentionDays: number,
): Promise<CompleteOutcome> {
  if (!UUID.test(uploadId)) return { outcome: 'not_found', documentId: null };
  const rows = await tx.$queryRaw<
    { outcome: CompleteOutcome['outcome']; document_id: string | null }[]
  >`
    SELECT outcome, document_id::text FROM oz_complete_document_upload(${uploadId}::uuid, ${retentionDays}::integer)`;
  const row = rows[0];
  if (row?.outcome === 'completed' && row.document_id !== null) {
    return { outcome: 'completed', documentId: row.document_id };
  }
  if (row === undefined || row.outcome === 'completed') {
    throw new Error('Réception d’un dépôt : réponse inattendue de la base.');
  }
  return { outcome: row.outcome, documentId: null };
}

/** Rejet à la réception ; `false` si l'intention n'est pas la sienne ou n'est plus `issued`. */
export async function rejectDocumentUpload(
  tx: TransactionClient,
  uploadId: string,
  reason: RejectReason,
): Promise<boolean> {
  if (!UUID.test(uploadId)) return false;
  const rows = await tx.$queryRaw<{ rejected: boolean }[]>`
    SELECT oz_reject_document_upload(${uploadId}::uuid, ${reason}) AS rejected`;
  return rows[0]?.rejected === true;
}

/** Cible d'un dépôt telle que le demandeur la voit, en entrée de `documentSubject` (@oz/auth). */
export interface DocumentTargetRecord {
  readonly kind: 'player' | 'guardian' | 'organization';
  readonly ownerUserId: string | null;
  /** Le demandeur lui-même s'il est le tuteur vérifié du joueur ; jamais un autre tuteur. */
  readonly guardianUserId: string | null;
  readonly organizationId: string | null;
  readonly birthDate: Date | null;
  /** Instant de la base auquel la RLS a jugé la ligne : la minorité se décide à cet instant. */
  readonly checkedAt: Date;
}

/**
 * Cible désignée par une demande de dépôt, lue sous le contexte du demandeur. `null` si la RLS la
 * cache, si elle est supprimée ou mal formée : l'existence n'est jamais révélée.
 */
export async function documentTargetFor(
  tx: TransactionClient,
  target: UploadTarget,
): Promise<DocumentTargetRecord | null> {
  if ('playerId' in target) {
    const player = await playerRecord(tx, target.playerId);
    if (player === null) return null;
    return {
      kind: 'player',
      ownerUserId: player.userId,
      guardianUserId: player.guardianUserId,
      organizationId: player.organizationId,
      birthDate: player.birthDate,
      checkedAt: player.checkedAt,
    };
  }
  if ('guardianId' in target) {
    if (!UUID.test(target.guardianId)) return null;
    const rows = await tx.$queryRaw<{ user_id: string | null; checked_at: Date }[]>`
      SELECT user_id::text, now() AS checked_at FROM guardians
      WHERE id = ${target.guardianId}::uuid AND deleted_at IS NULL`;
    const row = rows[0];
    if (row === undefined) return null;
    return {
      kind: 'guardian',
      ownerUserId: row.user_id,
      guardianUserId: null,
      organizationId: null,
      birthDate: null,
      checkedAt: row.checked_at,
    };
  }
  if (!UUID.test(target.organizationId)) return null;
  const rows = await tx.$queryRaw<{ id: string; checked_at: Date }[]>`
    SELECT id::text, now() AS checked_at FROM organizations
    WHERE id = ${target.organizationId}::uuid AND deleted_at IS NULL`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    kind: 'organization',
    ownerUserId: null,
    guardianUserId: null,
    organizationId: row.id,
    birthDate: null,
    checkedAt: row.checked_at,
  };
}
