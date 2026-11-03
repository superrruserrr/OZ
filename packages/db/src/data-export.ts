// Export des données personnelles (lot 1.16ba) : appels typés à la migration 20261109100000_data_export.
// L'assemblage tourne hors de tout contexte utilisateur, sous le rôle `oz_worker` (lot 1.16bb) ; la
// demande et son suivi, sous le contexte RLS du demandeur (`withUserContext`).

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client ou transaction : seule la requête brute est utilisée. */
type Queryable = Pick<TransactionClient, '$queryRaw'>;

/** JSON versionné rendu par `oz_personal_data_export` (D7), une section par catégorie. */
export interface PersonalDataExport {
  readonly formatVersion: 1;
  readonly generatedAt: string;
  readonly account: Readonly<Record<string, unknown>>;
  readonly [section: string]: unknown;
}

/**
 * Toutes les données personnelles du compte `userId`, ou `null` s'il est inconnu ou supprimé.
 * `encryptionKey` : `DATABASE_ENCRYPTION_KEY`, qui déchiffre téléphones, emails et numéros de pièce.
 */
export async function personalDataExport(
  db: Queryable,
  userId: string,
  encryptionKey: string,
): Promise<PersonalDataExport | null> {
  if (!UUID.test(userId)) return null;
  const rows = await db.$queryRaw<{ data: PersonalDataExport | null }[]>`
    SELECT oz_personal_data_export(${userId}::uuid, ${encryptionKey}) AS data`;
  return rows[0]?.data ?? null;
}

export type DataExportStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';

export type DataExportRequestOutcome =
  | { readonly outcome: 'accepted'; readonly id: string; readonly requestedAt: Date }
  /** Une demande en attente, en cours ou prête existe déjà (D3). */
  | { readonly outcome: 'active' }
  /** Demande acceptée il y a moins de 24 heures (D3). */
  | { readonly outcome: 'too_soon'; readonly nextRequestAt: Date }
  /** Compte supprimé, suspendu ou clos. */
  | { readonly outcome: 'refused' };

/**
 * Demande d'export du compte du contexte, auditée `data.export.requested` dans la transaction.
 * Lève `insufficient_privilege` sans contexte utilisateur.
 */
export async function requestDataExport(tx: TransactionClient): Promise<DataExportRequestOutcome> {
  const rows = await tx.$queryRaw<{ outcome: string; id: string | null; at: Date | null }[]>`
    SELECT r ->> 'outcome' AS outcome, r ->> 'id' AS id,
      coalesce(r ->> 'requestedAt', r ->> 'nextRequestAt')::timestamptz AS at
    FROM oz_data_export_request() AS r`;
  const row = rows[0];
  if (row?.outcome === 'accepted' && row.id !== null && row.at !== null) {
    return { outcome: 'accepted', id: row.id, requestedAt: row.at };
  }
  if (row?.outcome === 'too_soon' && row.at !== null) {
    return { outcome: 'too_soon', nextRequestAt: row.at };
  }
  if (row?.outcome === 'active') return { outcome: 'active' };
  if (row?.outcome === 'refused') return { outcome: 'refused' };
  throw new Error('export : réponse inattendue de oz_data_export_request');
}

export interface DataExportSummary {
  readonly id: string;
  readonly status: DataExportStatus;
  readonly requestedAt: Date;
  readonly readyAt: Date | null;
  readonly expiresAt: Date | null;
  /** Instant à partir duquel une nouvelle demande sera acceptée (D3). */
  readonly nextRequestAt: Date;
}

/** Dernière demande du compte du contexte (RLS : les siennes seules), ou `null`. */
export async function latestDataExport(tx: TransactionClient): Promise<DataExportSummary | null> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      status: DataExportStatus;
      requested_at: Date;
      ready_at: Date | null;
      expires_at: Date | null;
      next_request_at: Date;
    }[]
  >`
    SELECT id::text, status, requested_at, ready_at, expires_at,
      requested_at + interval '24 hours' AS next_request_at
    FROM data_export_requests
    WHERE user_id = oz_current_user_id()
    ORDER BY requested_at DESC, id DESC
    LIMIT 1`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    readyAt: row.ready_at,
    expiresAt: row.expires_at,
    nextRequestAt: row.next_request_at,
  };
}
