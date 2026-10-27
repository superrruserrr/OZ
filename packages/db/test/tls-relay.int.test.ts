import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pgConnectionOptions } from '@oz/config';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTlsRelay } from '../src/tls-relay.js';
import { PROVISIONED_EXTENSIONS, startDatabase } from './database.js';
import { startTlsDatabase, type TlsDatabase } from './tls-database.js';

const run = promisify(execFile);
const PACKAGE_DIR = new URL('..', import.meta.url).pathname;

let db: TlsDatabase;
beforeAll(async () => {
  db = await startTlsDatabase();
  await run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], { cwd: PACKAGE_DIR });
});
afterAll(async () => {
  await db.stop();
});

async function sslInUse(options: pg.ClientConfig): Promise<boolean> {
  const client = new pg.Client(options);
  await client.connect();
  try {
    const { rows } = await client.query<{ ssl: boolean }>(
      'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()',
    );
    return rows[0]?.ssl === true;
  } finally {
    await client.end();
  }
}

/** `pnpm db:migrate` (dist/cli/migrate.js) avec l'environnement donné, sans le .env du poste. */
async function dbMigrate(env: Record<string, string>): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run('node', ['dist/cli/migrate.js'], {
      cwd: PACKAGE_DIR,
      env: { PATH: process.env.PATH, ...env },
    });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, output: failed.stdout + failed.stderr };
  }
}

describe('épinglage TLS de pg (API, D-006) sur une base réelle', () => {
  it("accepte l'autorité de l'instance, bien que l'adresse ne soit pas dans le certificat", async () => {
    expect(await sslInUse(pgConnectionOptions(db.url('?sslmode=require'), db.ca))).toBe(true);
  });

  it('refuse un certificat signé par une autre autorité', async () => {
    await expect(sslInUse(pgConnectionOptions(db.url(), db.otherCa))).rejects.toThrow();
  });
});

describe('pourquoi le relais (D-039)', () => {
  it("Prisma seul, en sslmode=require, accepte le certificat d'une autorité inconnue", async () => {
    const { stdout } = await run('pnpm', ['exec', 'prisma', 'migrate', 'status'], {
      cwd: PACKAGE_DIR,
      env: { PATH: process.env.PATH, DATABASE_URL: db.url('?sslmode=require') },
    }).catch((error: unknown) => ({ stdout: (error as { stdout: string }).stdout }));
    // Si ce test échoue, Prisma vérifie désormais les certificats : réévaluer D-039.
    expect(stdout).toMatch(/not yet been applied/);
  });
});

describe('relais TLS épinglé (tls-relay.ts)', () => {
  it("chiffre jusqu'à la base quand l'autorité est la bonne", async () => {
    const relay = await startTlsRelay({ host: db.host, port: db.port }, db.ca);
    try {
      const url = `postgresql://postgres:oz-test-tls@127.0.0.1:${String(relay.port)}/postgres`;
      expect(await sslInUse({ connectionString: url, ssl: false })).toBe(true);
    } finally {
      await relay.close();
    }
  });

  it('coupe la connexion si le certificat vient d’une autre autorité', async () => {
    const relay = await startTlsRelay({ host: db.host, port: db.port }, db.otherCa);
    try {
      const url = `postgresql://postgres:oz-test-tls@127.0.0.1:${String(relay.port)}/postgres`;
      await expect(sslInUse({ connectionString: url, ssl: false })).rejects.toThrow();
      expect(relay.lastError()?.message).toMatch(/certificate/i);
    } finally {
      await relay.close();
    }
  });

  it('coupe la connexion si la base ne propose pas TLS (jamais de repli en clair)', async () => {
    const plain = await startDatabase();
    const target = new URL(plain.url);
    const relay = await startTlsRelay({ host: target.hostname, port: Number(target.port) }, db.ca);
    try {
      const url = `postgresql://u:p@127.0.0.1:${String(relay.port)}/postgres`;
      await expect(sslInUse({ connectionString: url, ssl: false })).rejects.toThrow();
      expect(relay.lastError()?.message).toMatch(/ne propose pas TLS/);
    } finally {
      await relay.close();
      await plain.stop();
    }
  });
});

describe('pnpm db:migrate en recette (dist/cli/migrate.js)', () => {
  beforeAll(async () => {
    const client = new pg.Client(pgConnectionOptions(db.url(), db.ca));
    await client.connect();
    for (const extension of PROVISIONED_EXTENSIONS) {
      await client.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
    }
    await client.end();
  });

  it("refuse une autre autorité que celle de l'instance, sans rien appliquer", async () => {
    const result = await dbMigrate({
      APP_ENV: 'staging',
      DATABASE_MIGRATION_URL: db.url('?sslmode=require'),
      DATABASE_CA_CERT: db.otherCa,
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/connexion TLS à la base refusée/);
  });

  it('refuse la recette sans DATABASE_CA_CERT', async () => {
    const result = await dbMigrate({
      APP_ENV: 'staging',
      DATABASE_MIGRATION_URL: db.url('?sslmode=require'),
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/DATABASE_CA_CERT requise/);
  });

  it("applique les migrations à travers le relais avec l'autorité de l'instance", async () => {
    const result = await dbMigrate({
      APP_ENV: 'staging',
      DATABASE_MIGRATION_URL: db.url('?sslmode=require'),
      DATABASE_CA_CERT: db.ca.replaceAll('\n', '\\n'),
    });
    expect(result.output).toMatch(/successfully applied/);
    expect(result.code).toBe(0);
  });
});
