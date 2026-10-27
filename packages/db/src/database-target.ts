// Sans dépendance au monorepo : importé par prisma.config.ts, chargé avant toute compilation.

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
  'sslaccept',
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
