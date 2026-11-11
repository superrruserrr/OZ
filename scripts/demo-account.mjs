// Compte de démonstration local (lot 1.5dc) : `node scripts/demo-account.mjs`.
// Crée ou met à jour un compte « club » connectable, rattaché à une organisation vérifiée, pour
// parcourir l'annuaire et les fiches du jeu synthétique. Poste local seulement (APP_ENV=local) ; le
// mot de passe est généré, conforme à la politique (12 caractères au moins), et écrit dans
// `.demo/demo.env` (non versionné) : il n'est jamais affiché ni codé en dur.
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = `${root}.demo/demo.env`;
const EMAIL = 'root@oz.localhost';
const PASSWORD_KEY = 'DEMO_ROOT_PASSWORD';

function fail(message) {
  process.stderr.write(`✖ ${message}\n`);
  process.exit(1);
}

if (process.env.APP_ENV !== 'local')
  fail('Compte de démonstration réservé au poste (APP_ENV=local).');
// Connexion du propriétaire de la base de démonstration : l'API, elle, passe par un rôle soumis à la RLS.
const databaseUrl = process.env.DEMO_OWNER_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1):\d+\//.test(databaseUrl)) {
  fail('DATABASE_URL doit viser une base locale (localhost).');
}

const { hashPassword } = await import(`${root}packages/auth/dist/index.js`);
const pg = createRequire(`${root}packages/db/package.json`)('pg');

/** Mot de passe déjà consigné dans `.demo/demo.env`, sinon généré et ajouté au fichier. */
function demoPassword() {
  const current = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').match(new RegExp(`^${PASSWORD_KEY}=(.+)$`, 'm'))?.[1]
    : undefined;
  if (current) return current;
  const generated = randomBytes(15).toString('base64url');
  appendFileSync(envFile, `${PASSWORD_KEY}=${generated}\n`, { mode: 0o600 });
  return generated;
}

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
try {
  await db.query('BEGIN');
  const hash = await hashPassword(demoPassword());
  const user = await db.query(
    `INSERT INTO users (email, password_hash, status, email_verified_at)
     VALUES ($1, $2, 'active', now())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       email_verified_at = COALESCE(users.email_verified_at, now())
     RETURNING id`,
    [EMAIL, hash],
  );
  const userId = user.rows[0].id;
  const club = await db.query(
    `SELECT id, name FROM organizations WHERE type = 'club' AND deleted_at IS NULL ORDER BY name LIMIT 1`,
  );
  if (club.rowCount === 0) fail('Aucun club : lancer `pnpm db:seed` avant ce script.');
  const { id: organizationId, name } = club.rows[0];
  await db.query(`UPDATE organizations SET verification_status = 'verified' WHERE id = $1`, [
    organizationId,
  ]);
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'club', $2)
     ON CONFLICT DO NOTHING`,
    [userId, organizationId],
  );
  // Fiches visibles : un club ne lit que des majeurs à l'identité vérifiée. Dans cette base de
  // démonstration seulement, un majeur fictif sur deux est marqué vérifié.
  const verified = await db.query(
    `UPDATE players SET verification_status = 'verified'
     WHERE id IN (
       SELECT id FROM players
       WHERE deleted_at IS NULL AND NOT oz_is_minor(birth_date) AND verification_status = 'declared'
       ORDER BY id LIMIT (SELECT count(*) / 2 FROM players WHERE NOT oz_is_minor(birth_date))
     ) AND NOT EXISTS (SELECT 1 FROM players WHERE verification_status = 'verified')`,
  );
  await db.query('COMMIT');
  process.stdout.write(
    `✓ Compte de démonstration prêt : ${EMAIL}, rôle club de « ${name} ».\n` +
      `  Fiches marquées vérifiées à cette exécution : ${String(verified.rowCount)}.\n` +
      `  Mot de passe : variable ${PASSWORD_KEY} du fichier .demo/demo.env.\n`,
  );
} catch (error) {
  await db.query('ROLLBACK');
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await db.end();
}
