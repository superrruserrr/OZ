// Pilotage de l'environnement de développement (lot 0.2) : pnpm dev:up | dev:down | dev:reset | dev:status.
// Échoue toujours avec un message explicite : jamais d'échec silencieux.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export const SERVICES = ['postgres', 'redis', 's3', 'clamav', 'mailpit'];
const EXTENSIONS = ['pgcrypto', 'pg_trgm', 'unaccent'];
const UP_TIMEOUT_MS = 5 * 60_000;
const TARGET_MS = 2 * 60_000;

/** État des services d'après `docker compose ps --format json` (une ligne JSON par service, ou un tableau). */
export function parseComposePs(output) {
  const trimmed = output.trim();
  if (trimmed === '') return new Map();
  const rows = trimmed.startsWith('[')
    ? JSON.parse(trimmed)
    : trimmed.split('\n').map((line) => JSON.parse(line));
  return new Map(
    rows.map((row) => [row.Service, { state: row.State ?? '', health: row.Health ?? '' }]),
  );
}

/** Services prêts, en attente ou en échec. Un service sans healthcheck ne peut pas être « prêt ». */
export function healthReport(statuses, expected) {
  const pending = [];
  const failed = [];
  for (const service of expected) {
    const status = statuses.get(service);
    if (!status) pending.push(`${service} (absent)`);
    else if (status.state !== 'running') failed.push(`${service} (${status.state})`);
    else if (status.health === 'unhealthy') failed.push(`${service} (unhealthy)`);
    else if (status.health !== 'healthy')
      pending.push(`${service} (${status.health || 'sans healthcheck'})`);
  }
  return {
    ready: pending.length === 0 && failed.length === 0,
    pending: pending.sort(),
    failed: failed.sort(),
  };
}

/** Attend qu'une condition soit vraie, avec un délai maximal. Horloge et attente injectables (tests). */
export async function waitUntil(
  condition,
  { timeoutMs, intervalMs, now = Date.now, sleep = delay },
) {
  const start = now();
  for (;;) {
    if (await condition()) return { ok: true, elapsedMs: now() - start };
    if (now() - start >= timeoutMs) return { ok: false, elapsedMs: now() - start };
    await sleep(intervalMs);
  }
}

/** Crée .env depuis .env.example s'il manque ; ne modifie jamais un .env existant. */
export function ensureEnvFile(root) {
  const env = join(root, '.env');
  const example = join(root, '.env.example');
  if (existsSync(env)) return 'kept';
  if (!existsSync(example)) throw new Error(`.env.example introuvable dans ${root}`);
  copyFileSync(example, env);
  return 'created';
}

/** La suppression des volumes exige « oui » tapé, ou --yes ; jamais par défaut sans terminal. */
export function shouldReset({ yesFlag = false, answer, interactive = true }) {
  if (yesFlag) return true;
  if (!interactive) return false;
  return answer?.trim().toLowerCase() === 'oui';
}

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const composeArgs = [
  'compose',
  '--env-file',
  join(root, '.env'),
  '-f',
  join(root, 'infra/docker/compose.dev.yml'),
];

/**
 * Binaire docker : celui du PATH, sinon les emplacements standard de Docker Desktop sur macOS
 * (installation utilisateur dans ~/.docker/bin, ou binaires embarqués dans l'application).
 */
export function resolveDocker({ home, inPath, exists }) {
  if (inPath) return 'docker';
  const candidates = [
    join(home, '.docker/bin/docker'),
    '/Applications/Docker.app/Contents/Resources/bin/docker',
  ];
  return candidates.find((candidate) => exists(candidate)) ?? null;
}

const dockerBinary = resolveDocker({
  home: homedir(),
  inPath: !spawnSync('docker', ['--version'], { encoding: 'utf8' }).error,
  exists: existsSync,
});

function docker(args, options = {}) {
  if (!dockerBinary)
    return { error: new Error('docker introuvable'), status: null, stdout: '', stderr: '' };
  return spawnSync(dockerBinary, args, { cwd: root, encoding: 'utf8', ...options });
}

function compose(args, options) {
  return docker([...composeArgs, ...args], options);
}

function fail(message) {
  console.error(`✖ ${message}`);
  return 1;
}

function checkDocker() {
  const result = docker(['version', '--format', '{{.Server.Version}}']);
  if (result.error) {
    return 'Docker est introuvable (ni dans le PATH, ni dans ~/.docker/bin, ni dans Docker.app). Installer Docker Desktop (https://www.docker.com/products/docker-desktop/) puis le lancer.';
  }
  if (dockerBinary !== 'docker') {
    console.log(
      `• docker trouvé hors du PATH : ${dockerBinary} (ajouter ~/.docker/bin au PATH pour l'utiliser dans le terminal)`,
    );
  }
  if (result.status !== 0) {
    return `Le moteur Docker ne répond pas (Docker Desktop est-il lancé ?) : ${result.stderr.trim()}`;
  }
  return null;
}

function statuses() {
  const result = compose(['ps', '--all', '--format', 'json']);
  if (result.status !== 0) throw new Error(`docker compose ps a échoué : ${result.stderr.trim()}`);
  return parseComposePs(result.stdout);
}

function psql(sql) {
  return compose([
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$0"',
    sql,
  ]);
}

function ensureBucket() {
  const bucket = process.env.S3_BUCKET ?? 'oz-documents';
  const list = compose(['exec', '-T', 's3', 'sh', '-c', 'echo "s3.bucket.list" | weed shell']);
  if (list.status !== 0) return `liste des buckets impossible : ${list.stderr.trim()}`;
  if (new RegExp(`(^|\\s)${bucket}(\\s|$)`, 'm').test(list.stdout)) return null;
  const create = compose([
    'exec',
    '-T',
    's3',
    'sh',
    '-c',
    `echo "s3.bucket.create -name ${bucket}" | weed shell`,
  ]);
  return create.status === 0
    ? null
    : `création du bucket ${bucket} impossible : ${create.stderr.trim()}`;
}

async function up() {
  const dockerError = checkDocker();
  if (dockerError) return fail(dockerError);
  try {
    if (ensureEnvFile(root) === 'created') console.log('• .env créé depuis .env.example');
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const started = compose(['up', '-d', '--remove-orphans'], { stdio: 'inherit' });
  if (started.status !== 0) return fail('docker compose up a échoué (voir ci-dessus).');

  let report = healthReport(new Map(), SERVICES);
  const waited = await waitUntil(
    () => {
      report = healthReport(statuses(), SERVICES);
      if (report.failed.length > 0) return true;
      return report.ready;
    },
    { timeoutMs: UP_TIMEOUT_MS, intervalMs: 2_000 },
  );
  if (report.failed.length > 0)
    return fail(`services en échec : ${report.failed.join(', ')} (voir \`docker compose logs\`).`);
  if (!waited.ok)
    return fail(`délai dépassé, services pas encore prêts : ${report.pending.join(', ')}.`);

  for (const extension of EXTENSIONS) {
    const result = psql(`CREATE EXTENSION IF NOT EXISTS ${extension};`);
    if (result.status !== 0)
      return fail(`extension PostgreSQL ${extension} indisponible : ${result.stderr.trim()}`);
  }
  const bucketError = ensureBucket();
  if (bucketError) return fail(bucketError);

  const seconds = Math.round(waited.elapsedMs / 1000);
  console.log(
    `✓ ${SERVICES.length} services healthy en ${seconds} s${waited.elapsedMs > TARGET_MS ? ' (au-delà de l’objectif de 2 min : premier téléchargement des signatures ClamAV ?)' : ''}.`,
  );
  console.log(`✓ Extensions PostgreSQL : ${EXTENSIONS.join(', ')}. Bucket S3 prêt.`);
  console.log('  Mailpit : http://localhost:8025');
  return 0;
}

function down() {
  const dockerError = checkDocker();
  if (dockerError) return fail(dockerError);
  return compose(['down'], { stdio: 'inherit' }).status === 0
    ? 0
    : fail('docker compose down a échoué.');
}

async function reset(argv) {
  const dockerError = checkDocker();
  if (dockerError) return fail(dockerError);
  const interactive = Boolean(process.stdin.isTTY);
  let answer;
  if (interactive && !argv.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    answer = await rl.question(
      'Supprimer les conteneurs ET toutes les données locales (volumes oz-*) ? Taper « oui » : ',
    );
    rl.close();
  }
  if (!shouldReset({ yesFlag: argv.includes('--yes'), answer, interactive })) {
    return fail('réinitialisation annulée (taper « oui », ou `pnpm dev:reset --yes`).');
  }
  return compose(['down', '--volumes', '--remove-orphans'], { stdio: 'inherit' }).status === 0
    ? 0
    : fail('docker compose down --volumes a échoué.');
}

function status() {
  const dockerError = checkDocker();
  if (dockerError) return fail(dockerError);
  const report = healthReport(statuses(), SERVICES);
  compose(['ps', '--all'], { stdio: 'inherit' });
  return report.ready ? 0 : fail(`pas prêt : ${[...report.failed, ...report.pending].join(', ')}`);
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...rest] = process.argv.slice(2);
  const commands = { up, down, reset: () => reset(rest), status };
  const run = commands[command];
  process.exitCode = run
    ? await run()
    : fail(`commande inconnue « ${command ?? ''} » : up | down | reset | status`);
}
