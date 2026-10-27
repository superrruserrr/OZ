import { databaseTarget, type DatabaseTarget } from './target.js';

/**
 * Transport des commandes Prisma vers la base (D-039). Le moteur de schéma de Prisma accepte, avec
 * `sslmode=require`, n'importe quel certificat : en recette et en production, il ne contacte la base
 * qu'à travers le relais TLS épinglé de `pnpm db:migrate` (voir tls-relay.ts).
 */

const SECURED_ENVS = new Set(['staging', 'production']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const SSL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslpassword', 'sslaccept'];

/** Autorité de l'instance (`\n` littéraux acceptés, comme l'API) ; vide = absente. */
export function migrationCaCert(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env.DATABASE_CA_CERT?.replaceAll('\\n', '\n').trim();
  return value ? value : undefined;
}

/**
 * Refuse une commande Prisma qui contacterait la base sans vérifier son certificat : autorité absente en
 * recette ou en production, ou autorité fournie mais URL qui ne passe pas par le relais local.
 */
export function assertPinnedTransport(
  env: Readonly<Record<string, string | undefined>>,
  url: string,
): void {
  const caCert = migrationCaCert(env);
  if (!caCert && SECURED_ENVS.has(env.APP_ENV ?? '')) {
    throw new Error(
      `DATABASE_CA_CERT requise en ${String(env.APP_ENV)} : sans elle, Prisma accepte n'importe quel certificat (D-039).`,
    );
  }
  if (caCert && !LOOPBACK.has(new URL(url).hostname)) {
    throw new Error(
      'DATABASE_CA_CERT définie : passer par `pnpm db:migrate`, qui vérifie le certificat de la base (D-039).',
    );
  }
}

/** Cible réelle de la base, et URL à donner à Prisma pour passer par le relais local en clair. */
export function relayPlan(url: string): {
  target: DatabaseTarget;
  relayedUrl: (port: number) => string;
} {
  const target = databaseTarget(url);
  return {
    target,
    relayedUrl: (port) => {
      const relayed = new URL(url);
      relayed.hostname = '127.0.0.1';
      relayed.port = String(port);
      for (const name of SSL_PARAMS) relayed.searchParams.delete(name);
      // Le chiffrement est fait par le relais ; le tronçon local ne quitte pas la machine.
      relayed.searchParams.set('sslmode', 'disable');
      return relayed.toString();
    },
  };
}
