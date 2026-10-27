import { pgConnectionOptions } from '@oz/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

/**
 * Client Prisma sur le pilote `pg` (Prisma 7, adaptateur). L'URL vient de la configuration validée
 * de l'application, jamais d'une valeur en dur ; aucune connexion n'est ouverte avant la première requête.
 * `caCert` (recette, production) : TLS épinglé sur l'autorité de l'instance Scaleway (D-006).
 */
export function createDbClient(databaseUrl: string, caCert?: string): PrismaClient {
  if (!/^postgres(ql)?:\/\/\S+$/.test(databaseUrl.trim())) {
    throw new Error('DATABASE_URL invalide : URL postgresql:// attendue.');
  }
  return new PrismaClient({ adapter: new PrismaPg(pgConnectionOptions(databaseUrl, caCert)) });
}

export type { PrismaClient };
