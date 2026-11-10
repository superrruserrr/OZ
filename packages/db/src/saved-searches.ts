// Recherches sauvegardées (lot 1.14b, EX-116 n° 3, D2) : appels typés à la migration
// 20261115100000_search_saved_exports, sous le contexte RLS du titulaire (`withUserContext`).
// Critères et tri seuls ; la validation des critères est faite par l'API (contrat Zod).

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SavedSearchRecord {
  readonly id: string;
  readonly name: string;
  readonly criteria: Readonly<Record<string, unknown>>;
  readonly sort: string;
  readonly direction: 'asc' | 'desc' | null;
  readonly createdAt: Date;
}

export interface SavedSearchDraft {
  readonly name: string;
  readonly criteria: Readonly<Record<string, unknown>>;
  readonly sort: string;
  readonly direction?: 'asc' | 'desc' | undefined;
}

export type SavedSearchCreateOutcome =
  | { readonly outcome: 'created'; readonly id: string; readonly createdAt: Date }
  /** Le compte en a déjà 20. */
  | { readonly outcome: 'limit' };

/** Sauvegardes du compte du contexte, les plus récentes d'abord. */
export async function listSavedSearches(tx: TransactionClient): Promise<SavedSearchRecord[]> {
  return tx.$queryRaw<SavedSearchRecord[]>`
    SELECT id::text, name, criteria, sort, direction, created_at AS "createdAt"
    FROM saved_searches
    WHERE user_id = oz_current_user_id()
    ORDER BY created_at DESC, id DESC`;
}

/** Création pour le compte du contexte ; lève `insufficient_privilege` sans contexte. */
export async function createSavedSearch(
  tx: TransactionClient,
  draft: SavedSearchDraft,
): Promise<SavedSearchCreateOutcome> {
  const rows = await tx.$queryRaw<{ outcome: string; id: string | null; at: Date | null }[]>`
    SELECT r ->> 'outcome' AS outcome, r ->> 'id' AS id, (r ->> 'createdAt')::timestamptz AS at
    FROM oz_saved_search_create(${draft.name}, ${JSON.stringify(draft.criteria)}::jsonb,
      ${draft.sort}, ${draft.direction ?? null}) AS r`;
  const row = rows[0];
  if (row?.outcome === 'created' && row.id !== null && row.at !== null) {
    return { outcome: 'created', id: row.id, createdAt: row.at };
  }
  if (row?.outcome === 'limit') return { outcome: 'limit' };
  throw new Error('Recherche sauvegardée : réponse inattendue de la base.');
}

/** Suppression d'une sauvegarde du compte du contexte ; `false` : inconnue ou d'un autre compte. */
export async function deleteSavedSearch(tx: TransactionClient, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const deleted = await tx.$executeRaw`
    DELETE FROM saved_searches WHERE id = ${id}::uuid AND user_id = oz_current_user_id()`;
  return deleted > 0;
}
