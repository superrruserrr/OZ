import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { migrationCaCert, relayPlan } from '../migrate-transport.js';
import { startTlsRelay, type TlsRelay } from '../tls-relay.js';
import { fail } from './environment.js';

// pnpm db:migrate : `prisma migrate deploy`, à travers le relais TLS épinglé si DATABASE_CA_CERT est
// définie (recette, production — D-039). Sans elle (poste, CI), Prisma contacte la base directement.
const PACKAGE_DIR = fileURLToPath(new URL('../../', import.meta.url));
const PRISMA = createRequire(import.meta.url).resolve('prisma/build/index.js');

function prisma(env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PRISMA, 'migrate', 'deploy'], {
      cwd: PACKAGE_DIR,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

let relay: TlsRelay | undefined;
try {
  const caCert = migrationCaCert(process.env);
  const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  let env = process.env;
  if (caCert) {
    if (!url) throw new Error('DATABASE_MIGRATION_URL (ou DATABASE_URL) manquante.');
    const plan = relayPlan(url);
    relay = await startTlsRelay(plan.target, caCert);
    env = { ...process.env, DATABASE_MIGRATION_URL: plan.relayedUrl(relay.port) };
  }
  const code = await prisma(env);
  const upstream = relay?.lastError();
  if (upstream) throw new Error(`connexion TLS à la base refusée : ${upstream.message}`);
  process.exitCode = code;
} catch (error) {
  fail(error);
} finally {
  await relay?.close();
}
