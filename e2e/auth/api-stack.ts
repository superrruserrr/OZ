import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { request } from '@playwright/test';
import { GenericContainer, Wait } from 'testcontainers';
import { MAILPIT_IMAGE, smtpHost, startServices } from '../../apps/api/test/containers.js';

/** Même image que infra/docker/compose.dev.yml et le test d'analyse du worker. */
const CLAMAV_IMAGE = 'clamav/clamav:1.5.4-debian13-slim';

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
export default function startAuthStack(): Promise<() => Promise<void>> {
  return startApiStack();
}

/**
 * Pile de l'API. Avec `documents` (lot 1.9cb, parcours n° 10) : coffre ouvert, ClamAV et le worker
 * compilé, lancé comme en production ; sa sortie JSON est écrite dans `E2E_WORKER_LOG`.
 */
export async function startApiStack(
  options: { readonly documents?: boolean } = {},
): Promise<() => Promise<void>> {
  const documents = options.documents === true;
  await run(
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=@oz/api',
      ...(documents ? ['--filter=@oz/worker'] : []),
    ],
    { cwd: root },
  );
  const [services, mailpit, clamd] = await Promise.all([
    startServices(),
    new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
    documents ? startClamav() : Promise.resolve(undefined),
  ]);
  await run(process.execPath, ['packages/db/dist/cli/migrate.js'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: services.env.DATABASE_URL },
  });
  // Tous les parcours partagent l'IP locale : `login_ip` et `register_ip` ne mesurent rien ici.
  const db = new pg.Client({ connectionString: services.env.DATABASE_URL });
  await db.connect();
  await db.query(
    `INSERT INTO system_settings (key, value) VALUES ('rate_limits', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [
      JSON.stringify({
        login_ip: { limit: 100, windowSeconds: 900 },
        register_ip: { limit: 100, windowSeconds: 3_600 },
      }),
    ],
  );
  await db.end();
  // Le fournisseur factice écrit les OTP sur la sortie standard : les parcours les y lisent.
  const smsLog = join(mkdtempSync(join(tmpdir(), 'oz-e2e-')), 'api.log');
  const output = openSync(smsLog, 'a');
  process.env.E2E_API_LOG = smsLog;
  const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    stdio: ['ignore', output, 'ignore'],
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
      ...(documents ? { FEATURE_DOCUMENTS: 'true' } : {}),
    },
  });
  process.env.E2E_MAILPIT_URL = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}`;
  await waitForHealth(Date.now() + 60_000);

  let worker: ReturnType<typeof spawn> | undefined;
  if (clamd !== undefined) {
    // Base, Redis et stockage de l'API ; en local, le worker se replie sur `DATABASE_URL`.
    const workerLog = join(mkdtempSync(join(tmpdir(), 'oz-e2e-')), 'worker.log');
    process.env.E2E_WORKER_LOG = workerLog;
    process.env.E2E_DATABASE_URL = services.env.DATABASE_URL;
    process.env.E2E_S3_ENDPOINT = services.env.S3_ENDPOINT;
    process.env.E2E_S3_ACCESS_KEY = services.env.S3_ACCESS_KEY;
    process.env.E2E_S3_SECRET_KEY = services.env.S3_SECRET_KEY;
    process.env.E2E_S3_BUCKET = services.env.S3_BUCKET;
    worker = spawn(process.execPath, ['apps/worker/dist/main.js'], {
      cwd: root,
      stdio: ['ignore', openSync(workerLog, 'a'), 'ignore'],
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        APP_ENV: 'local',
        LOG_LEVEL: 'info',
        S3_REGION: 'fr-par',
        ...services.env,
        CLAMAV_HOST: clamd.getHost() === 'localhost' ? '127.0.0.1' : clamd.getHost(),
        CLAMAV_PORT: String(clamd.getMappedPort(3310)),
      },
    });
  }

  return async () => {
    worker?.kill('SIGTERM');
    api.kill('SIGTERM');
    await Promise.all([services.stop(), mailpit.stop(), clamd?.stop()]);
  };
}

/** ClamAV avec ses signatures embarquées, prêt à répondre (mêmes limites que compose.dev.yml). */
async function startClamav() {
  const clamd = await new GenericContainer(CLAMAV_IMAGE)
    .withEnvironment({
      CLAMAV_NO_FRESHCLAMD: 'true',
      CLAMD_CONF_StreamMaxLength: '50M',
      CLAMD_CONF_MaxFileSize: '50M',
      CLAMD_CONF_AlertExceedsMax: 'yes',
    })
    .withExposedPorts(3310)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(240_000)
    .start();
  // clamd ouvre son port avant d'avoir chargé ses signatures : attendre sa réponse à PING.
  const pong = () =>
    new Promise<boolean>((resolve) => {
      const socket = connect(clamd.getMappedPort(3310), '127.0.0.1');
      let answer = '';
      socket.setTimeout(2_000, () => socket.destroy());
      socket.on('connect', () => socket.end('zPING\0'));
      socket.on('data', (chunk) => (answer += chunk.toString()));
      socket.on('close', () => {
        resolve(answer.startsWith('PONG'));
      });
      socket.on('error', () => {
        resolve(false);
      });
    });
  for (let attempt = 0; !(await pong()); attempt += 1) {
    if (attempt >= 120) throw new Error('clamd ne répond pas');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return clamd;
}
