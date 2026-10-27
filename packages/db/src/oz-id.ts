import { issueWithRetry, isValidOzId, type OzId, type RandomSource } from '@oz/core';
import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssuedOzId {
  readonly ozId: OzId;
  /** Tirages nécessaires (1 sauf collision). */
  readonly attempts: number;
}

/**
 * Émet l'OZ ID d'un joueur (lot 1.2, EX-102) dans la transaction `tx`, qui porte le contexte de
 * l'appelant (`withUserContext`) : la partie aléatoire est tirée ici, la base fixe le pays de
 * rattachement et l'année, réserve, pose et journalise (`oz_issue_oz_id`), et rend NULL si la partie
 * est déjà prise. Tout ou rien : si la transaction échoue ensuite, aucun OZ ID n'a été réservé.
 */
export function issueOzId(tx: TransactionClient, playerId: string): Promise<IssuedOzId> {
  return issueOzIdWithSource(tx, playerId);
}

/**
 * Variante à source d'aléa injectée, réservée aux seeds et aux tests : non exportée par `@oz/db`, pour
 * que l'API ne puisse jamais émettre un OZ ID dont la partie aléatoire viendrait d'ailleurs.
 */
export async function issueOzIdWithSource(
  tx: TransactionClient,
  playerId: string,
  source?: RandomSource,
): Promise<IssuedOzId> {
  if (!UUID.test(playerId)) throw new Error('OZ ID : identifiant de joueur UUID attendu.');
  const { value, attempts } = await issueWithRetry(async (random) => {
    const rows = await tx.$queryRaw<{ oz_id: string | null }[]>`
      SELECT oz_issue_oz_id(${playerId}::uuid, ${random}) AS oz_id`;
    return rows[0]?.oz_id ?? null;
  }, source);
  // Défense en profondeur : la base et packages/core doivent calculer le même contrôle.
  if (!isValidOzId(value)) throw new Error('OZ ID émis invalide : base et code divergent.');
  return { ozId: value, attempts };
}
