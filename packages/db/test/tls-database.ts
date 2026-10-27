import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { POSTGRES_IMAGE } from './database.js';

const run = promisify(execFile);

/**
 * PostgreSQL en TLS, signé par une autorité générée pour le test, comme une instance Scaleway : le
 * certificat porte un nom (db.internal), jamais l'adresse par laquelle on joint la base.
 */
export interface TlsDatabase {
  readonly host: string;
  readonly port: number;
  /** Autorité qui a signé le certificat de la base. */
  readonly ca: string;
  /** Autre autorité, valide mais étrangère à la base (attaquant, mauvaise instance). */
  readonly otherCa: string;
  url(query?: string): string;
  stop(): Promise<void>;
}

const PASSWORD = 'oz-test-tls';

async function openssl(dir: string, args: readonly string[]): Promise<void> {
  await run('openssl', [...args], { cwd: dir });
}

async function authority(dir: string, name: string): Promise<void> {
  await openssl(dir, [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    `/CN=OZ test ${name}`,
    '-keyout',
    `${name}.key`,
    '-out',
    `${name}.crt`,
  ]);
}

export async function startTlsDatabase(): Promise<TlsDatabase> {
  const dir = mkdtempSync(join(tmpdir(), 'oz-pg-tls-'));
  await authority(dir, 'ca');
  await authority(dir, 'other');
  await openssl(dir, [
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-subj',
    '/CN=db.internal',
    '-keyout',
    'server.key',
    '-out',
    'server.csr',
  ]);
  writeFileSync(join(dir, 'ext.cnf'), 'subjectAltName=DNS:db.internal\n');
  await openssl(dir, [
    'x509',
    '-req',
    '-days',
    '1',
    '-in',
    'server.csr',
    '-CA',
    'ca.crt',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-extfile',
    'ext.cnf',
    '-out',
    'server.crt',
  ]);

  // La clé doit appartenir à postgres avec des droits 0600 : copiée puis ajustée au démarrage.
  const container: StartedTestContainer = await new GenericContainer(POSTGRES_IMAGE)
    .withEnvironment({ POSTGRES_PASSWORD: PASSWORD })
    .withCopyFilesToContainer([
      { source: join(dir, 'server.crt'), target: '/certs/server.crt' },
      { source: join(dir, 'server.key'), target: '/certs/server.key' },
    ])
    .withEntrypoint(['sh', '-c'])
    .withCommand([
      'cp /certs/server.* /tmp/ && chown postgres /tmp/server.* && chmod 600 /tmp/server.key && ' +
        'exec docker-entrypoint.sh postgres -c ssl=on ' +
        '-c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key',
    ])
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const ca = readFileSync(join(dir, 'ca.crt'), 'utf8');
  const otherCa = readFileSync(join(dir, 'other.crt'), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  return {
    host,
    port,
    ca,
    otherCa,
    url: (query = '') =>
      `postgresql://postgres:${PASSWORD}@${host}:${String(port)}/postgres${query}`,
    stop: async () => {
      await container.stop();
    },
  };
}
