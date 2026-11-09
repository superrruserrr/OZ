// Suppression de compte (lot 1.16ca, EX-118 n° 3) : appels typés à la migration
// 20261111100000_account_deletion. Demande, suivi et annulation : API, sous le contexte du titulaire.
// Échéances et anonymisation : worker (`oz_worker`), hors contexte utilisateur.

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Borne des lots du worker, la même qu'en base. */
const MAX_BATCH = 500;

type Queryable = Pick<TransactionClient, '$queryRaw'>;

export type AccountDeletionRequestOutcome =
  | {
      readonly outcome: 'accepted';
      readonly id: string;
      readonly requestedAt: Date;
      readonly scheduledFor: Date;
    }
  /** Une demande attend déjà son échéance. */
  | { readonly outcome: 'pending'; readonly scheduledFor: Date }
  /** Compte supprimé, suspendu ou clos. */
  | { readonly outcome: 'refused' };

/**
 * Demande du titulaire du contexte : anonymisation à +30 jours, sessions révoquées, audit
 * `account.deletion.requested`. Lève `insufficient_privilege` sans contexte.
 */
export async function requestAccountDeletion(
  tx: TransactionClient,
): Promise<AccountDeletionRequestOutcome> {
  const rows = await tx.$queryRaw<
    { outcome: string; id: string | null; since: Date | null; at: Date | null }[]
  >`
    SELECT r ->> 'outcome' AS outcome, r ->> 'id' AS id,
      (r ->> 'requestedAt')::timestamptz AS since, (r ->> 'scheduledFor')::timestamptz AS at
    FROM oz_account_deletion_request() AS r`;
  const row = rows[0];
  if (row?.outcome === 'accepted' && row.id !== null && row.since !== null && row.at !== null) {
    return { outcome: 'accepted', id: row.id, requestedAt: row.since, scheduledFor: row.at };
  }
  if (row?.outcome === 'pending' && row.at !== null) {
    return { outcome: 'pending', scheduledFor: row.at };
  }
  if (row?.outcome === 'refused') return { outcome: 'refused' };
  throw new Error('suppression : réponse inattendue de oz_account_deletion_request');
}

/** Annulation tant que la demande n'est pas exécutée (lot 1.16cba, D2), auditée ; faux sinon. */
export async function cancelAccountDeletion(tx: TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ done: boolean }[]>`
    SELECT oz_account_deletion_cancel() AS done`;
  return rows[0]?.done === true;
}

export interface PendingAccountDeletion {
  readonly id: string;
  readonly requestedAt: Date;
  readonly scheduledFor: Date;
}

/** Demande en attente du titulaire du contexte (RLS : les siennes seules), ou `null`. */
export async function pendingAccountDeletion(
  tx: TransactionClient,
): Promise<PendingAccountDeletion | null> {
  const rows = await tx.$queryRaw<{ id: string; requested_at: Date; scheduled_for: Date }[]>`
    SELECT id::text, requested_at, scheduled_for FROM account_deletion_requests
    WHERE status = 'pending' AND user_id = oz_current_user_id()`;
  const row = rows[0];
  return row === undefined
    ? null
    : { id: row.id, requestedAt: row.requested_at, scheduledFor: row.scheduled_for };
}

/** Demandes échues, les plus anciennes d'abord. */
export async function dueAccountDeletions(db: Queryable, limit: number): Promise<string[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) {
    throw new TypeError(`suppression : lot de 1 à ${String(MAX_BATCH)}`);
  }
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM oz_account_deletion_due(${limit}::integer) AS id`;
  return rows.map((row) => row.id);
}

/**
 * `done`, `not_due` (rétractation en cours), statut en place (`cancelled`, `done`), `unknown`, ou
 * `frozen` : compte suspendu, rien modifié, demande en attente (lot 1.16cba, D3).
 */
export type AccountAnonymizeOutcome = 'done' | 'frozen' | 'not_due' | 'cancelled' | 'unknown';

/** Anonymise le compte d'une demande échue (registre d'effacement), auditée `account.deletion.done`. */
export async function anonymizeAccount(
  db: Queryable,
  requestId: string,
): Promise<AccountAnonymizeOutcome> {
  if (!UUID.test(requestId)) return 'unknown';
  const rows = await db.$queryRaw<{ outcome: AccountAnonymizeOutcome }[]>`
    SELECT oz_account_anonymize(${requestId}::uuid) AS outcome`;
  return rows[0]?.outcome ?? 'unknown';
}
