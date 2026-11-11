// Pile de démonstration locale (lot 1.5dc) : `node scripts/demo-setup.mjs`.
// Monte un Postgres isolé (conteneur `oz-demo-postgres`, port 5544) — la base de développement n'est
// jamais touchée —, génère `.demo/demo.env` (clés et mots de passe aléatoires, non versionnés),
// applique les migrations, charge le jeu synthétique et crée le compte de démonstration.
// Idempotent : relancer ne recrée rien. Poste local seulement.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = `${root}.demo/demo.env`;
const CONTAINER = 'oz-demo-postgres';
const PORT = 5544;
const WEB = 'http://localhost:3010';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(`✖ ${command} ${args.slice(0, 3).join(' ')}…\n${result.stderr ?? ''}\n`);
    process.exit(1);
  }
  return result.stdout ?? '';
}
const psql = (sql) =>
  run(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'oz', '-d', 'oz_demo', '-q', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
    },
  );
const secret = (bytes) => randomBytes(bytes).toString('base64');

// 1. Postgres isolé.
const names = run('docker', ['ps', '-a', '--format', '{{.Names}}']).split('\n');
if (!names.includes(CONTAINER)) {
  run('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-e',
    'POSTGRES_USER=oz',
    '-e',
    'POSTGRES_PASSWORD=oz',
    '-e',
    'POSTGRES_DB=oz_demo',
    '-p',
    `127.0.0.1:${String(PORT)}:5432`,
    '-v',
    'oz-demo-postgres:/var/lib/postgresql/data',
    'postgres:16.15-alpine',
  ]);
} else {
  run('docker', ['start', CONTAINER]);
}
for (let attempt = 0; ; attempt += 1) {
  const ready = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'oz', '-d', 'oz_demo']);
  if (ready.status === 0) break;
  if (attempt > 30) {
    process.stderr.write('✖ Postgres de démonstration injoignable.\n');
    process.exit(1);
  }
  spawnSync('sleep', ['1']);
}

// 2. Environnement de démonstration (créé une seule fois).
if (!existsSync(envFile)) {
  mkdirSync(`${root}.demo`, { recursive: true });
  const appPassword = randomBytes(18).toString('base64url');
  writeFileSync(
    envFile,
    [
      '# Pile de démonstration locale : généré par scripts/demo-setup.mjs, jamais versionné.',
      'APP_ENV=local',
      'NODE_ENV=development',
      `APP_URL=${WEB}`,
      'API_URL=http://localhost:3001',
      'API_PORT=3001',
      `CORS_ORIGINS=${WEB}`,
      'FEATURE_CONTACT_FORM=true',
      'FEATURE_AUTH=true',
      'SMTP_HOST=127.0.0.1',
      'SMTP_PORT=1025',
      'EMAIL_FROM="OZ <no-reply@oz.localhost>"',
      'REDIS_URL=redis://localhost:6379/5',
      'S3_ENDPOINT=http://localhost:8333',
      'S3_REGION=fr-par',
      'S3_BUCKET=oz-documents',
      'S3_ACCESS_KEY=oz-dev-access',
      'S3_SECRET_KEY=oz-dev-secret',
      "# L'API se connecte sous un rôle applicatif soumis à la RLS, comme en recette.",
      `DATABASE_URL=postgresql://oz_app_demo:${appPassword}@localhost:${String(PORT)}/oz_demo`,
      '# Propriétaire : migrations, seed et scripts de démonstration.',
      `DEMO_OWNER_DATABASE_URL=postgresql://oz:oz@localhost:${String(PORT)}/oz_demo`,
      `AUTH_HMAC_KEY=${secret(48)}`,
      `DATABASE_ENCRYPTION_KEY=${secret(48)}`,
      `DATABASE_BLIND_INDEX_KEY=${secret(48)}`,
      `JWT_ACCESS_SECRET=${secret(64)}`,
      `JWT_REFRESH_SECRET=${secret(64)}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
}
process.loadEnvFile(envFile);
const owner = process.env.DEMO_OWNER_DATABASE_URL;
const appPassword = new URL(process.env.DATABASE_URL).password;

// 3. Extensions et rôles (créés par Terraform en recette), migrations, jeu synthétique, compte.
psql(`CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    CREATE ROLE oz_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    CREATE ROLE oz_worker NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app_demo') THEN
    CREATE ROLE oz_app_demo LOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;`);
const ownerEnv = { ...process.env, DATABASE_URL: owner };
run('pnpm', ['db:migrate'], { env: ownerEnv });
psql(`ALTER ROLE oz_app_demo PASSWORD '${appPassword.replaceAll("'", "''")}';
GRANT oz_app TO oz_app_demo; GRANT USAGE ON SCHEMA public TO oz_app_demo;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oz_app_demo;`);
run('pnpm', ['db:seed'], { env: ownerEnv });
run('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@oz/api', '--output-logs=errors-only']);
process.stdout.write(run(process.execPath, ['scripts/demo-account.mjs'], { env: process.env }));
process.stdout.write(
  `✓ Démonstration prête. Lancer l'API (node --env-file=.demo/demo.env apps/api/dist/main.js)\n` +
    `  puis le site (node scripts/demo-web.mjs -- port 3010), et ouvrir ${WEB}.\n`,
);
