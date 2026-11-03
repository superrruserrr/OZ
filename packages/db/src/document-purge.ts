// Purge du coffre (lot 1.9cb) : appels typés à la migration 20261106100000_document_purge, hors de
// tout contexte utilisateur, sous le rôle `oz_worker`. Le worker supprime les fichiers ; les
// fonctions privilégiées décident de ce qui est purgeable et journalisent (D-059).

import type { UploadDocumentType } from './document-uploads.js';
import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_KEY =
  /^(incoming|quarantine|clean)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Borne des fonctions de la base (lots et clés soumises). */
const MAX_BATCH = 500;

/** Client ou transaction : seule la requête brute est utilisée. */
type Queryable = Pick<TransactionClient, '$queryRaw'>;

export interface DuePurge {
  readonly id: string;
  readonly type: UploadDocumentType;
}

export interface StalePending {
  readonly id: string;
  /** `requeue` après 30 minutes, `fail` après 24 heures (D-099). */
  readonly action: 'requeue' | 'fail';
}

function assertBatch(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) {
    throw new TypeError(`purge des documents : lot de 1 à ${String(MAX_BATCH)}`);
  }
}

/** Pièces échues à purger : ni purgées, ni en analyse, sans URL délivrée depuis 5 minutes (D-101). */
export async function listDuePurges(db: Queryable, limit: number): Promise<DuePurge[]> {
  assertBatch(limit);
  const rows = await db.$queryRaw<{ id: string; type: UploadDocumentType }[]>`
    SELECT id::text, type::text AS type FROM oz_document_purge_due(${limit}::integer)`;
  return rows.map((row) => ({ id: row.id, type: row.type }));
}

/** Marque la pièce purgée, ses fichiers supprimés ; `skipped` si elle ne l'est plus (aucune écriture). */
export async function finishDocumentPurge(
  db: Queryable,
  documentId: string,
): Promise<'done' | 'skipped'> {
  if (!UUID.test(documentId)) throw new TypeError('purge : identifiant de document invalide');
  const rows = await db.$queryRaw<{ outcome: string }[]>`
    SELECT oz_document_purge_finish(${documentId}::uuid) AS outcome`;
  const outcome = rows[0]?.outcome;
  if (outcome !== 'done' && outcome !== 'skipped') {
    throw new Error('Purge : réponse inattendue de la base.');
  }
  return outcome;
}

/** Parmi des clés du bucket (500 au plus), celles que rien ne justifie plus (D-062, D-092). */
export async function findStorageOrphans(
  db: Queryable,
  keys: readonly string[],
): Promise<string[]> {
  if (keys.length > MAX_BATCH) throw new TypeError('objets orphelins : 500 clés au plus');
  if (keys.some((key) => !STORAGE_KEY.test(key))) {
    throw new TypeError('objets orphelins : clé hors format');
  }
  if (keys.length === 0) return [];
  const rows = await db.$queryRaw<{ key: string }[]>`
    SELECT oz_document_storage_orphans(${[...keys]}::text[]) AS key`;
  const submitted = new Set(keys);
  // Seule une clé soumise peut être désignée : rien d'autre n'est jamais supprimé.
  return rows.map((row) => row.key).filter((key) => submitted.has(key));
}

/** Analyses abandonnées à relancer ou à clore (D-099). */
export async function listStalePending(db: Queryable, limit: number): Promise<StalePending[]> {
  assertBatch(limit);
  const rows = await db.$queryRaw<{ id: string; action: string }[]>`
    SELECT id::text, action FROM oz_document_stale_pending(${limit}::integer)`;
  return rows.map((row) => {
    if (row.action !== 'requeue' && row.action !== 'fail') {
      throw new Error('Balayage : réponse inattendue de la base.');
    }
    return { id: row.id, action: row.action };
  });
}
