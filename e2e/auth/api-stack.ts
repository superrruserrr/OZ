import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { request } from '@playwright/test';
import { GenericContainer, Wait } from 'testcontainers';
import { MAILPIT_IMAGE, smtpHost, startServices } from '../../apps/api/test/containers.js';

// Parcours E2E de l'authentification (lot 1.3b, D4) : l'API compilée, lancée comme en production,
// contre PostgreSQL, Redis, S3 et Mailpit jetables. Clés et secrets tirés au hasard à chaque
// lancement, jamais conservés.

export const API_URL = 'http://127.0.0.1:3101';
/** Origine de la liste blanche CORS, exigée par le rafraîchissement et la déconnexion. */
export const WEB_ORIGIN = 'http://localhost:3100';

const run = promisify(execFile);
const rootUrl = new URL('../../', import.meta.url);
const root = rootUrl.pathname;
// `pg` n'est dépendance que de l'API : résolu depuis elle, seules ces méthodes servent ici.
interface SqlClient {
  connect(): Promise<unknown>;
  query(sql: string, values: unknown[]): Promise<unknown>;
  end(): Promise<void>;
}
const pg = createRequire(new URL('apps/api/package.json', rootUrl))('pg') as {
  Client: new (config: { connectionString: string | undefined }) => SqlClient;
};
const secret = (bytes: number) => randomBytes(bytes).toString('base64');

async function waitForHealth(deadline: number): Promise<void> {
  const api = await request.newContext({ baseURL: API_URL });
  try {
    for (;;) {
      try {
        if ((await api.get('/health')).ok()) return;
      } catch {
        // API pas encore à l'écoute.
      }
      if (Date.now() > deadline) throw new Error(`API E2E injoignable sur ${API_URL}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } finally {
    await api.dispose();
  }
}

/** Démarre la pile ; rend la fonction d'arrêt (global teardown de Playwright). */
export default async function startApiStack(): Promise<() => Promise<void>> {
  await run('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@oz/api'], { cwd: root });
  const [services, mailpit] = await Promise.all([
    startServices(),
    new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
  ]);
  await run(process.execPath, ['packages/db/dist/cli/migrate.js'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: services.env.DATABASE_URL },
  });
  // Tous les parcours partagent l'IP locale : `login_ip` (5 / 15 min) ne mesure rien ici.
  const db = new pg.Client({ connectionString: services.env.DATABASE_URL });
  await db.connect();
  await db.query(
    `INSERT INTO system_settings (key, value) VALUES ('rate_limits', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ login_ip: { limit: 100, windowSeconds: 900 } })],
  );
  await db.end();
  const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    stdio: 'ignore',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      APP_ENV: 'local',
      API_PORT: '3101',
      LOG_LEVEL: 'warn',
      S3_REGION: 'fr-par',
      CORS_ORIGINS: WEB_ORIGIN,
      ...services.env,
      FEATURE_AUTH: 'true',
      APP_URL: WEB_ORIGIN,
      SMTP_HOST: smtpHost(mailpit.getHost()),
      SMTP_PORT: String(mailpit.getMappedPort(1025)),
      EMAIL_FROM: 'OZ <no-reply@oz.localhost>',
      AUTH_HMAC_KEY: secret(48),
      DATABASE_ENCRYPTION_KEY: secret(48),
      DATABASE_BLIND_INDEX_KEY: secret(48),
      JWT_ACCESS_SECRET: secret(64),
      JWT_REFRESH_SECRET: secret(64),
    },
  });
  process.env.E2E_MAILPIT_URL = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}`;
  await waitForHealth(Date.now() + 60_000);

  return async () => {
    api.kill('SIGTERM');
    await Promise.all([services.stop(), mailpit.stop()]);
  };
}
