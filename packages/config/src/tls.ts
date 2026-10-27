import type { ConnectionOptions } from 'node:tls';

/**
 * TLS vers PostgreSQL et Redis managés (D-006, lot 0.8b). Scaleway signe chaque instance avec sa
 * propre autorité, dont le certificat est fourni par Terraform (`DATABASE_CA_CERT`, `REDIS_CA_CERT`) :
 * la chaîne est vérifiée contre cette seule autorité (épinglage). Le nom d'hôte ne l'est pas — l'IP du
 * réseau privé n'apparaît pas dans le certificat —, soit l'équivalent de `sslmode=verify-ca`.
 */
type TlsOptions = Pick<ConnectionOptions, 'ca' | 'rejectUnauthorized' | 'checkServerIdentity'>;

const pinnedTo = (ca: string): TlsOptions => ({
  ca,
  rejectUnauthorized: true,
  checkServerIdentity: () => undefined,
});

/** Paramètres d'URL que `pg` appliquerait après l'option `ssl`, au risque d'annuler l'épinglage. */
const PG_SSL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat'];

export function pgConnectionOptions(
  url: string,
  caCert?: string,
): { connectionString: string; ssl?: TlsOptions } {
  if (!caCert) return { connectionString: url };
  const parsed = new URL(url);
  for (const name of PG_SSL_PARAMS) parsed.searchParams.delete(name);
  return { connectionString: parsed.toString(), ssl: pinnedTo(caCert) };
}

export function redisTlsOptions(url: string, caCert?: string): { tls?: TlsOptions } {
  if (!caCert) return {};
  if (!url.startsWith('rediss://')) {
    throw new Error('REDIS_CA_CERT fourni avec une URL redis:// : rediss:// attendu.');
  }
  return { tls: pinnedTo(caCert) };
}
