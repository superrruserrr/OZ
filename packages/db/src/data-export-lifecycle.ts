// Cycle de vie d'une demande d'export (lot 1.16bb) : appels typés à la migration
// 20261110100000_data_export_archive. Prise, fin, échec, maintenance : worker (`oz_worker`), hors
// contexte utilisateur. Téléchargement : API, sous le contexte du titulaire.

import type { DataExportStatus } from './data-export.js';
import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON = /^[a-z_]{1,40}$/;
/** Borne des lots de maintenance, la même qu'en base. */
const MAX_BATCH = 500;

/** Client ou transaction : seule la requête brute est utilisée. */
type Queryable = Pick<TransactionClient, '$queryRaw'>;

/** Motifs d'échec internes, sans donnée (D6 du lot 1.16bb). */
export type DataExportFailure = 'account_gone' | 'build_failed' | 'abandoned';

/** Compte à exporter, ou `null` si la demande n'est plus à produire. */
export async function claimDataExport(db: Queryable, requestId: string): Promise<string | null> {
  if (!UUID.test(requestId)) return null;
  const rows = await db.$queryRaw<{ owner: string | null }[]>`
    SELECT oz_data_export_claim(${requestId}::uuid)::text AS owner`;
  return rows[0]?.owner ?? null;
}

/**
 * Issue d'une transition : `done` si elle a eu lieu, sinon le statut en place (inchangé) ou
 * `unknown`. Une archive n'est retirée que si la demande n'est pas `ready`.
 */
export type DataExportTransition = 'done' | DataExportStatus | 'unknown';

/**
 * Archive écrite sous `exports/<demande>.json` : demande prête 7 jours. `account_gone` : compte
 * supprimé, suspendu ou clos entre-temps, demande passée `failed`.
 */
export async function finishDataExport(
  db: Queryable,
  requestId: string,
): Promise<DataExportTransition | 'account_gone'> {
  const rows = await db.$queryRaw<{ outcome: DataExportTransition | 'account_gone' }[]>`
    SELECT oz_data_export_finish(${requestId}::uuid) AS outcome`;
  return rows[0]?.outcome ?? 'unknown';
}

export async function failDataExport(
  db: Queryable,
  requestId: string,
  reason: DataExportFailure,
): Promise<DataExportTransition> {
  if (!REASON.test(reason)) throw new TypeError('export : motif d’échec interne attendu');
  const rows = await db.$queryRaw<{ outcome: DataExportTransition }[]>`
    SELECT oz_data_export_fail(${requestId}::uuid, ${reason}) AS outcome`;
  return rows[0]?.outcome ?? 'unknown';
}

export interface DueDataExport {
  readonly id: string;
  /** `expire` : archive échue ; `requeue` : sans nouvelle depuis 30 min ; `fail` : depuis 24 h. */
  readonly action: 'expire' | 'requeue' | 'fail';
}

export async function listDueDataExports(db: Queryable, limit: number): Promise<DueDataExport[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) {
    throw new TypeError(`export : lot de 1 à ${String(MAX_BATCH)}`);
  }
  return db.$queryRaw<DueDataExport[]>`
    SELECT id::text, action FROM oz_data_export_due(${limit}::integer)`;
}

/** Archive supprimée du stockage : demande `expired`. */
export async function expireDataExport(db: Queryable, requestId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ done: boolean }[]>`
    SELECT oz_data_export_expire(${requestId}::uuid) AS done`;
  return rows[0]?.done === true;
}

/**
 * Clé de l'archive prête et non échue du titulaire du contexte, auditée `data.export.downloaded`
 * dans la transaction ; `null` s'il n'en a aucune.
 */
export async function dataExportDownloadKey(tx: TransactionClient): Promise<string | null> {
  const rows = await tx.$queryRaw<{ key: string | null }[]>`
    SELECT oz_data_export_download() AS key`;
  return rows[0]?.key ?? null;
}
