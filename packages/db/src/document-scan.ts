// Analyse des documents (lot 1.9b) : appels typés à la migration 20261104100000_document_scan, hors
// de tout contexte utilisateur. Le worker n'écrit jamais dans `documents` : les fonctions privilégiées
// contrôlent elles-mêmes la cohérence du verdict et journalisent (D-059).

import type { UploadDocumentType } from './document-uploads.js';
import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client ou transaction : seule la requête brute est utilisée. */
type Queryable = Pick<TransactionClient, '$queryRaw'>;

export interface ClaimedDocument {
  readonly id: string;
  readonly type: UploadDocumentType;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export type ScanRejectionReason =
  | 'dimensions'
  | 'pages'
  | 'unreadable'
  | 'hash_mismatch'
  /** Sortie du ré-encodage au-delà de 50 Mo (lot 1.9cb, D-099). */
  | 'too_large';

export type ScanVerdict =
  | {
      readonly verdict: 'clean';
      readonly sizeBytes: number;
      readonly image: {
        readonly width: number;
        readonly height: number;
        /** dHash 64 bits, lu comme un entier signé (colonne BIGINT). */
        readonly perceptualHash: bigint;
      } | null;
      readonly pageCount: number | null;
    }
  | { readonly verdict: 'infected'; readonly signature: string }
  | { readonly verdict: 'rejected'; readonly reason: ScanRejectionReason }
  | { readonly verdict: 'error' };

/** Document encore `pending` et non supprimé ; `null` sinon (job rejoué, inconnu ou retiré). */
export async function claimDocumentScan(
  db: Queryable,
  documentId: string,
): Promise<ClaimedDocument | null> {
  if (!UUID.test(documentId)) return null;
  const rows = await db.$queryRaw<
    {
      id: string;
      type: UploadDocumentType;
      storage_key: string;
      mime_type: string;
      size_bytes: bigint;
      sha256: string;
    }[]
  >`
    SELECT id::text, type::text AS type, storage_key, mime_type, size_bytes, sha256
    FROM oz_document_scan_claim(${documentId}::uuid)`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    type: row.type,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
  };
}

/** Verdict unique ; `skipped` si le document n'est plus `pending` (aucune écriture). */
export async function finishDocumentScan(
  db: Queryable,
  documentId: string,
  result: ScanVerdict,
): Promise<'done' | 'skipped'> {
  if (!UUID.test(documentId))
    throw new TypeError('verdict d’analyse : identifiant de document invalide');
  const clean = result.verdict === 'clean' ? result : null;
  const reason = result.verdict === 'rejected' ? result.reason : null;
  const signature = result.verdict === 'infected' ? result.signature : null;
  const rows = await db.$queryRaw<{ outcome: 'done' | 'skipped' }[]>`
    SELECT oz_document_scan_finish(${documentId}::uuid, ${result.verdict}, ${reason},
      ${clean?.sizeBytes ?? null}::bigint, ${clean?.image?.width ?? null}::integer,
      ${clean?.image?.height ?? null}::integer, ${clean?.pageCount ?? null}::integer,
      ${clean?.image?.perceptualHash ?? null}::bigint, ${signature}) AS outcome`;
  const outcome = rows[0]?.outcome;
  if (outcome !== 'done' && outcome !== 'skipped') {
    throw new Error('Verdict d’analyse : réponse inattendue de la base.');
  }
  return outcome;
}
