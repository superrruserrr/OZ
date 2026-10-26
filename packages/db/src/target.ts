import { parseEnv } from 'node:util';
import { resolveAppEnv, type AppEnv } from '@oz/config';

export interface DatabaseTarget {
  readonly host: string;
  readonly port: number;
  readonly database: string;
}

// Paramètres d'URL sans effet sur la cible (pg et Prisma). Tout autre (host, hostaddr, port, dbname,
// options…) pourrait diriger la connexion ailleurs que ce que l'hôte et le chemin annoncent.
const SAFE_PARAMS = new Set([
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslpassword',
  'connect_timeout',
  'application_name',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'pgbouncer',
  'statement_cache_size',
]);

/**
 * Hôte, port et base réellement visés par une URL PostgreSQL, tels que pg les contacte (hôte décodé,
 * IPv6 sans crochets). Refuse toute ambiguïté : autre schéma d'URL, socket Unix, paramètre de
 * redirection, schéma PostgreSQL autre que `public`.
 */
export function databaseTarget(databaseUrl: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL invalide : URL postgresql:// attendue.');
  }
  const unsafe = [...url.searchParams.entries()]
    .filter(([key, value]) => !SAFE_PARAMS.has(key) && !(key === 'schema' && value === 'public'))
    .map(([key]) => key);
  const host = decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, '$1');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    unsafe.length > 0 ||
    host === '' ||
    host.includes('/') ||
    database === '' ||
    database.includes('/')
  ) {
    throw new Error(
      `DATABASE_URL ambiguë : URL postgresql:// avec hôte et base explicites requise, paramètres refusés (${unsafe.join(', ') || 'aucun'}).`,
    );
  }
  return { host, port: url.port === '' ? 5432 : Number(url.port), database };
}

/**
 * Environnement des commandes à risque (rollback, seed, anonymisation). Le `.env` du poste n'est lu que
 * si DATABASE_URL n'est pas déjà définie : il ne peut pas compléter une URL exportée à la main (vers la
 * production, par exemple) avec son `APP_ENV=local`. APP_ENV est toujours exigé explicitement.
 */
export function cliEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  dotenvContent: string,
): { databaseUrl: string; appEnv: AppEnv } {
  // Une valeur vide compte comme absente.
  const exported = env.DATABASE_URL ? env.DATABASE_URL : undefined;
  const fromFile = exported === undefined ? parseEnv(dotenvContent) : {};
  const databaseUrl = exported ?? fromFile.DATABASE_URL ?? '';
  const rawAppEnv = env.APP_ENV || fromFile.APP_ENV;
  if (databaseUrl === '') throw new Error('DATABASE_URL manquante.');
  if (rawAppEnv === undefined || rawAppEnv === '') {
    throw new Error(
      'APP_ENV requis explicitement pour cette commande (local, preview, staging, production).',
    );
  }
  return { databaseUrl, appEnv: resolveAppEnv(rawAppEnv, env.NODE_ENV) };
}
