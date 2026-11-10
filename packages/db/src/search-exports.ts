// Exports CSV de la recherche (lot 1.14b, EX-116 n° 4, 7, D3 à D5) : appels typés à la migration
// 20261115100000_search_saved_exports, sous le contexte RLS du demandeur (`withUserContext`).

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Abonnement courant d'une organisation du lecteur (RLS : membres seulement), relu en base (CP-33). */
export interface CurrentSubscription {
  readonly tier: string;
  readonly quotas: Readonly<Record<string, unknown>>;
}

/** `null` : aucun abonnement courant (palier gratuit par défaut) ou organisation hors de portée. */
export async function currentSubscription(
  tx: TransactionClient,
  organizationId: string,
): Promise<CurrentSubscription | null> {
  if (!UUID.test(organizationId)) return null;
  const rows = await tx.$queryRaw<{ tier: string; quotas: Record<string, unknown> }[]>`
    SELECT tier, quotas FROM subscriptions
    WHERE organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      AND status IN ('trialing', 'active', 'past_due') AND period_end > now()
    LIMIT 1`;
  return rows[0] ?? null;
}

export interface SearchExportEntry {
  /** Organisation imputée ; `null` pour l'administrateur seul. */
  readonly organizationId: string | null;
  readonly rows: number;
  readonly sort: string;
  /** Noms des critères employés, sans leur valeur. */
  readonly criteria: readonly string[];
}

export type SearchExportOutcome =
  | { readonly outcome: 'accepted'; readonly id: string; readonly createdAt: Date }
  /** Quota épuisé : rien n'est inscrit ; `resetAt`, prochaine place libre ; palier relu en base. */
  | { readonly outcome: 'quota_exceeded'; readonly tier: string; readonly resetAt: Date };

/**
 * Inscription d'un export, auditée `player.search.exported` dans la transaction (D5). Le quota
 * (exports par 24 heures, lignes) est relu en base par la fonction, jamais reçu de l'appelant. Lève
 * `insufficient_privilege` sans contexte, pour une organisation dont le lecteur n'est pas membre
 * vérifié, sans organisation hors administrateur, ou pour plus de lignes que le palier n'en permet.
 */
export async function recordSearchExport(
  tx: TransactionClient,
  entry: SearchExportEntry,
): Promise<SearchExportOutcome> {
  const rows = await tx.$queryRaw<
    { outcome: string; id: string | null; tier: string | null; at: Date | null }[]
  >`
    SELECT r ->> 'outcome' AS outcome, r ->> 'id' AS id, r ->> 'tier' AS tier,
      coalesce(r ->> 'createdAt', r ->> 'resetAt')::timestamptz AS at
    FROM oz_search_export_record(${entry.organizationId}::uuid, ${entry.rows}::int, ${entry.sort},
      ${[...entry.criteria]}::text[]) AS r`;
  const row = rows[0];
  if (row?.outcome === 'accepted' && row.id !== null && row.at !== null) {
    return { outcome: 'accepted', id: row.id, createdAt: row.at };
  }
  if (row?.outcome === 'quota_exceeded' && row.tier !== null && row.at !== null) {
    return { outcome: 'quota_exceeded', tier: row.tier, resetAt: row.at };
  }
  throw new Error('Export de recherche : réponse inattendue de la base.');
}
