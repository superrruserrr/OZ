import type { CurrentSubscription } from '@oz/db';

// Quota d'export de la recherche (lot 1.14b, EX-116 n° 7, D3) : palier gratuit par défaut, en
// attendant les montants et quotas de Q8. Un abonnement courant peut le surcharger par
// `subscriptions.quotas` (relu en base à chaque export, CP-33) ; une valeur hors bornes est ignorée.

/** Palier gratuit : à confirmer (Q8). */
export const FREE_TIER_QUOTAS = { searchExportsPerDay: 3, searchExportRows: 200 } as const;

/** Plafond absolu de lignes d'un export, tout palier compris (administrateur aussi). */
export const EXPORT_ROWS_CAP = 1000;

export interface ExportQuota {
  readonly tier: string;
  /** Exports par 24 heures glissantes pour l'organisation. */
  readonly perDay: number;
  readonly rows: number;
}

const bounded = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;

export function exportQuotaOf(subscription: CurrentSubscription | null): ExportQuota {
  const quotas = subscription?.quotas ?? {};
  return {
    tier: subscription?.tier ?? 'free',
    perDay: bounded(quotas.searchExportsPerDay, 0, 1000, FREE_TIER_QUOTAS.searchExportsPerDay),
    rows: bounded(quotas.searchExportRows, 1, EXPORT_ROWS_CAP, FREE_TIER_QUOTAS.searchExportRows),
  };
}
