import type { PrismaClient } from './client.js';

/** Client Prisma limité à une transaction (sans `$transaction`, `$connect`…). */
export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exécute `fn` dans une transaction dont le contexte RLS est l'utilisateur `userId` (plan §3.5, D3 du
 * lot 1.1) : `set_config(…, true)` ne vaut que pour la transaction, une connexion rendue au pool ne
 * garde aucun contexte. Sans cet appel, la RLS forcée ne laisse rien voir ni écrire.
 */
export async function withUserContext<T>(
  db: PrismaClient,
  userId: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId)) throw new Error('Contexte RLS : identifiant utilisateur UUID attendu.');
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('oz.user_id', ${userId}, true)`;
    return fn(tx);
  });
}
