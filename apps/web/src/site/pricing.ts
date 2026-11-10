/*
 * Grille tarifaire provisoire (lot 1.6, D3) : mêmes valeurs que `docs/legal/tarifs-provisoires.md`
 * (vérifié par test). Indicative : aucun paiement avant le lot 2.10 (Q8).
 */
export interface PlayerPlan {
  key: 'playerFree' | 'playerPremium';
  xaf: number;
  eur: number;
}

export interface OrgPlan {
  key: 'orgFree' | 'discovery' | 'pro' | 'elite';
  xaf: number;
  eur: number;
  /** `null` : sans limite. */
  managed: number | null;
  users: number | null;
  exportsPerDay: number;
}

export const PLAYER_PLANS: readonly PlayerPlan[] = [
  { key: 'playerFree', xaf: 0, eur: 0 },
  { key: 'playerPremium', xaf: 1000, eur: 2.99 },
];

export const ORG_PLANS: readonly OrgPlan[] = [
  { key: 'orgFree', xaf: 0, eur: 0, managed: 30, users: 1, exportsPerDay: 3 },
  { key: 'discovery', xaf: 15000, eur: 29, managed: 100, users: 3, exportsPerDay: 10 },
  { key: 'pro', xaf: 50000, eur: 89, managed: 500, users: 10, exportsPerDay: 30 },
  { key: 'elite', xaf: 150000, eur: 249, managed: null, users: null, exportsPerDay: 100 },
];
