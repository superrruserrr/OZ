import { describe, expect, it } from 'vitest';
import { EXPORT_ROWS_CAP, exportQuotaOf, FREE_TIER_QUOTAS } from './export-quota.js';

describe('exportQuotaOf', () => {
  it('sans abonnement : palier gratuit', () => {
    expect(exportQuotaOf(null)).toEqual({
      tier: 'free',
      perDay: FREE_TIER_QUOTAS.searchExportsPerDay,
      rows: FREE_TIER_QUOTAS.searchExportRows,
    });
  });

  it('abonnement : ses quotas, bornés ; valeur invalide ignorée', () => {
    expect(
      exportQuotaOf({ tier: 'pro', quotas: { searchExportsPerDay: 50, searchExportRows: 800 } }),
    ).toEqual({ tier: 'pro', perDay: 50, rows: 800 });
    expect(
      exportQuotaOf({
        tier: 'pro',
        quotas: { searchExportsPerDay: '50', searchExportRows: EXPORT_ROWS_CAP + 1 },
      }),
    ).toEqual({
      tier: 'pro',
      perDay: FREE_TIER_QUOTAS.searchExportsPerDay,
      rows: FREE_TIER_QUOTAS.searchExportRows,
    });
    expect(exportQuotaOf({ tier: 'stop', quotas: { searchExportsPerDay: 0 } }).perDay).toBe(0);
  });
});
