import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

// Même image que infra/docker/compose.dev.yml et les tests de l'API.
export const POSTGRES_IMAGE = 'postgres:16.15-alpine';

const run = promisify(execFile);
const PACKAGE_DIR = new URL('..', import.meta.url).pathname;

export interface TestDatabase {
  readonly url: string;
  query<T extends pg.QueryResultRow>(sql: string, values?: unknown[]): Promise<T[]>;
  /** Commande `prisma …` ou script `node dist/cli/….js` lancé contre cette base. */
  exec(command: string, args: readonly string[], env?: Record<string, string>): Promise<string>;
  stop(): Promise<void>;
}

// Extensions provisionnées avec la base, comme `pnpm dev:up` (scripts/dev-env.mjs) et Terraform (lot 0.8).
export const PROVISIONED_EXTENSIONS = ['pgcrypto', 'pg_trgm', 'unaccent'] as const;

/** PostgreSQL 16 provisionné comme le poste : extensions présentes, aucune table. */
export async function startDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    POSTGRES_IMAGE,
  ).start();
  const url = container.getConnectionUri();
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  for (const extension of PROVISIONED_EXTENSIONS) {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
  }
  return {
    url,
    async query<T extends pg.QueryResultRow>(sql: string, values?: unknown[]): Promise<T[]> {
      return (await pool.query<T>(sql, values)).rows;
    },
    async exec(command, args, env = {}) {
      const { stdout, stderr } = await run(command, [...args], {
        cwd: PACKAGE_DIR,
        env: { ...process.env, DATABASE_URL: url, ...env },
      });
      return stdout + stderr;
    },
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}

/** Connexion sous un rôle applicatif sans privilège, comme `oz_app` en recette (soumis à la RLS). */
export interface AppConnection {
  /** Exécute `fn` dans une transaction, avec le contexte utilisateur posé si `userId` est fourni. */
  as<T>(userId: string | null, fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

export async function connectAsAppRole(db: TestDatabase): Promise<AppConnection> {
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app_test') THEN
      CREATE ROLE oz_app_test LOGIN PASSWORD 'oz_app_test' NOSUPERUSER NOBYPASSRLS;
    END IF; END $$`);
  await db.query('GRANT USAGE ON SCHEMA public TO oz_app_test');
  await db.query(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oz_app_test',
  );
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  return {
    async as(userId, fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (userId !== null) {
          await client.query("SELECT set_config('oz.user_id', $1, true)", [userId]);
        }
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

/** Applique toutes les migrations avec Prisma (up). */
export const migrateDeploy = (db: TestDatabase): Promise<string> =>
  db.exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
