// Lecture des documents (lot 1.9ca) : appels typés à la migration 20261105100000_document_read, sous
// le contexte RLS de l'utilisateur (`withUserContext`). La décision revient à CASL (`document.read`) ;
// la base ne rend qu'une pièce visible du demandeur, saine, ni supprimée, ni purgée, ni échue (CP-21 ;
// lot 1.9cb : aucune URL ne naît après `retention_until`, la purge n'attend que les 5 minutes de la
// dernière URL délivrée, D-101).

import {
  documentTargetFor,
  type DocumentTargetRecord,
  type UploadDocumentType,
} from './document-uploads.js';
import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReadableDocument {
  readonly id: string;
  readonly type: UploadDocumentType;
  readonly mimeType: string;
  /** Toujours `clean/<id>` : seule clé jamais servie. */
  readonly storageKey: string;
  /** Sujet de la pièce, tel que le demandeur le voit, en entrée de `documentSubject` (@oz/auth). */
  readonly target: DocumentTargetRecord;
}

/**
 * Pièce lisible par le demandeur, ou `null` : inconnue, cachée, mal formée, non saine, supprimée,
 * purgée, échue, ou sujet invisible. L'existence n'est jamais révélée.
 */
export async function readableDocumentFor(
  tx: TransactionClient,
  documentId: string,
): Promise<ReadableDocument | null> {
  if (!UUID.test(documentId)) return null;
  const rows = await tx.$queryRaw<
    {
      id: string;
      type: UploadDocumentType;
      mime_type: string;
      storage_key: string;
      player_id: string | null;
      guardian_id: string | null;
      organization_id: string | null;
      admin_view: boolean;
      subject_live: boolean;
      checked_at: Date;
    }[]
  >`
    SELECT id::text, type::text AS type, mime_type, storage_key, player_id::text,
      guardian_id::text, organization_id::text,
      (SELECT oz_has_verified_role(ARRAY['admin']::role_kind[])) AS admin_view,
      oz_document_subject_live(id) AS subject_live, now() AS checked_at
    FROM documents
    WHERE id = ${documentId}::uuid AND av_status = 'clean' AND deleted_at IS NULL
      AND purged_at IS NULL AND retention_until > now()`;
  const row = rows[0];
  if (row === undefined) return null;
  const target =
    (await documentTargetFor(
      tx,
      row.player_id !== null
        ? { playerId: row.player_id }
        : row.guardian_id !== null
          ? { guardianId: row.guardian_id }
          : { organizationId: row.organization_id ?? '' },
    )) ?? (row.admin_view && row.subject_live ? adminTarget(row) : null);
  if (target === null) return null;
  return {
    id: row.id,
    type: row.type,
    mimeType: row.mime_type,
    storageKey: row.storage_key,
    target,
  };
}

/**
 * Sujet minimal pour l'administrateur, qui lit toute pièce dont le sujet est encore en place
 * (`oz_document_subject_live`) sans voir les fiches tuteur ni les organisations : sa règle CASL
 * (`document.read`, `logged`) ne porte sur aucun champ du sujet.
 */
function adminTarget(row: {
  player_id: string | null;
  guardian_id: string | null;
  organization_id: string | null;
  checked_at: Date;
}): DocumentTargetRecord {
  return {
    kind:
      row.player_id !== null ? 'player' : row.guardian_id !== null ? 'guardian' : 'organization',
    ownerUserId: null,
    guardianUserId: null,
    organizationId: row.player_id === null && row.guardian_id === null ? row.organization_id : null,
    birthDate: null,
    checkedAt: row.checked_at,
  };
}

/** Journal d'audit de la lecture, au nom de l'acteur (`audit_log_insert_self`) ; ni clé ni URL. */
export async function recordDocumentRead(
  tx: TransactionClient,
  actorUserId: string,
  document: { readonly id: string; readonly type: UploadDocumentType },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${actorUserId}::uuid, 'document.read.granted', 'document', ${document.id}::uuid,
      'Lecture accordée', jsonb_build_object('document_type', ${document.type}::text))`;
}
