// Joueurs de démonstration (lot 1.19cg) : `node scripts/demo-players.mjs`, lancé par demo-setup.
// Crée ou met à jour deux comptes joueur **fictifs**, connectables, avec une fiche complète et des
// photos libres sans visage (docs/legal/credits.md) :
// - Abena Paul (maquette) : fiche déclarée, modifiable, galerie de quatre photos ;
// - Samuel Ndongo : fiche vérifiée, donc trouvable par la recherche de l'en-tête d'Abena.
// Aucun nom de personne réelle. Poste local seulement (APP_ENV=local) ; mots de passe générés et
// écrits dans `.demo/demo.env` (non versionné), jamais affichés. Les photos sont posées comme si le
// coffre les avait analysées (verdict `clean`) : en démonstration seulement, par le propriétaire de
// la base ; un dépôt fait à l'écran suit, lui, le vrai chemin (analyse par le worker).
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = `${root}.demo/demo.env`;
const PHOTOS = `${root}apps/web/public/images/sport/`;

const PLAYERS = [
  {
    key: 'DEMO_ABENA_PASSWORD',
    email: 'abena@oz.localhost',
    firstName: 'Abena',
    lastName: 'Paul',
    birthDate: '2004-03-12',
    nationality: 'GH',
    region: 'Littoral',
    city: 'Douala',
    primaryPosition: 'winger',
    secondaryPosition: 'striker',
    dominantFoot: 'left',
    heightCm: 168,
    weightKg: 59,
    status: 'declared',
    photos: [
      ['joueur-crampons.jpg', 1280, 854],
      ['ballon-herbe.jpg', 1280, 702],
      ['crampons-gazon.jpg', 853, 1280],
      ['ballon-terrain.jpg', 853, 1280],
    ],
  },
  {
    key: 'DEMO_SAMUEL_PASSWORD',
    email: 'samuel@oz.localhost',
    firstName: 'Samuel',
    lastName: 'Ndongo',
    birthDate: '2001-09-04',
    nationality: 'CM',
    region: 'Centre',
    city: 'Yaoundé',
    primaryPosition: 'striker',
    secondaryPosition: 'attacking_midfielder',
    dominantFoot: 'right',
    heightCm: 181,
    weightKg: 74,
    status: 'verified',
    photos: [['crampons-ballon.jpg', 1024, 1280]],
  },
];

function fail(message) {
  process.stderr.write(`✖ ${message}\n`);
  process.exit(1);
}

if (process.env.APP_ENV !== 'local')
  fail('Joueurs de démonstration réservés au poste (APP_ENV=local).');
const databaseUrl = process.env.DEMO_OWNER_DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1):\d+\//.test(databaseUrl)) {
  fail('DEMO_OWNER_DATABASE_URL doit viser une base locale (localhost).');
}

const { hashPassword } = await import(`${root}packages/auth/dist/index.js`);
const { issueWithRetry } = await import(`${root}packages/core/dist/index.js`);
const { DocumentStorage, cleanKey } = await import(`${root}packages/storage/dist/index.js`);
const pg = createRequire(`${root}packages/db/package.json`)('pg');

/** Mot de passe déjà consigné dans `.demo/demo.env`, sinon généré et ajouté au fichier. */
function demoPassword(key) {
  const current = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]
    : undefined;
  if (current) return current;
  const generated = randomBytes(15).toString('base64url');
  appendFileSync(envFile, `${key}=${generated}\n`, { mode: 0o600 });
  return generated;
}

/** Stockage S3 local (SeaweedFS) ; `null` s'il ne répond pas : fiches sans photo, signalé. */
async function storageOrNull() {
  const storage = new DocumentStorage({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
  });
  try {
    // Lecture d'une clé valide absente : `null` si le stockage répond, une erreur sinon.
    await storage.head(cleanKey('00000000-0000-7000-8000-000000000000'));
    return storage;
  } catch {
    storage.destroy();
    return null;
  }
}

const storage = await storageOrNull();
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const lines = [];
try {
  await db.query('BEGIN');
  const admin = await db.query(
    `SELECT user_id FROM user_roles WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`,
  );
  if (admin.rowCount === 0) fail('Aucun administrateur : lancer `pnpm db:seed` avant ce script.');
  // L'OZ ID est émis par le chemin applicatif, au nom d'un administrateur du jeu synthétique.
  await db.query(`SELECT set_config('oz.user_id', $1, true)`, [admin.rows[0].user_id]);

  for (const p of PLAYERS) {
    const hash = await hashPassword(demoPassword(p.key));
    const user = await db.query(
      `INSERT INTO users (email, password_hash, status, email_verified_at)
       VALUES ($1, $2, 'active', now())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
         email_verified_at = COALESCE(users.email_verified_at, now())
       RETURNING id`,
      [p.email, hash],
    );
    const userId = user.rows[0].id;
    await db.query(
      `INSERT INTO user_roles (user_id, role) SELECT $1, 'player'
       WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'player')`,
      [userId],
    );
    const fields = [
      p.firstName,
      p.lastName,
      p.birthDate,
      p.nationality,
      p.region,
      p.city,
      p.primaryPosition,
      p.secondaryPosition,
      p.dominantFoot,
      p.heightCm,
      p.weightKg,
      p.status,
    ];
    const existing = await db.query(`SELECT id, oz_id FROM players WHERE user_id = $1`, [userId]);
    let playerId = existing.rows[0]?.id;
    if (playerId === undefined) {
      const inserted = await db.query(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
           region, city, primary_position, secondary_position, dominant_foot, height_cm, weight_kg,
           verification_status)
         VALUES ($1, $2, $3, $4, $5, 'CM', $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [userId, ...fields],
      );
      playerId = inserted.rows[0].id;
    } else {
      await db.query(
        `UPDATE players SET first_name = $2, last_name = $3, birth_date = $4, nationality = $5,
           region = $6, city = $7, primary_position = $8, secondary_position = $9,
           dominant_foot = $10, height_cm = $11, weight_kg = $12, verification_status = $13
         WHERE id = $1`,
        [playerId, ...fields],
      );
    }
    let ozId = existing.rows[0]?.oz_id ?? null;
    if (ozId === null) {
      ({ value: ozId } = await issueWithRetry(async (random) => {
        const issued = await db.query(`SELECT oz_issue_oz_id($1::uuid, $2) AS oz_id`, [
          playerId,
          random,
        ]);
        return issued.rows[0]?.oz_id ?? null;
      }));
    }

    // Photos : posées une fois ; la première devient la photo de profil.
    let photos = 0;
    const present = await db.query(
      `SELECT count(*)::int AS n FROM documents
       WHERE player_id = $1 AND type = 'photo' AND deleted_at IS NULL`,
      [playerId],
    );
    if (storage !== null && present.rows[0].n === 0) {
      for (const [index, [file, width, height]] of p.photos.entries()) {
        const bytes = new Uint8Array(readFileSync(`${PHOTOS}${file}`));
        const doc = await db.query(
          `WITH n AS (SELECT oz_uuid_v7() AS id)
           INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type,
             size_bytes, sha256, av_status, av_checked_at, width, height, retention_until)
           SELECT n.id, 'photo', $1, $2, 'clean/' || n.id, 'image/jpeg', $3, $4, 'clean', now(),
             $5, $6, now() + interval '100 years'
           FROM n RETURNING id`,
          [
            playerId,
            userId,
            bytes.length,
            createHash('sha256').update(bytes).digest('hex'),
            width,
            height,
          ],
        );
        const documentId = doc.rows[0].id;
        await storage.put(cleanKey(documentId), bytes, 'image/jpeg');
        if (index === 0) {
          await db.query(`UPDATE players SET profile_photo_id = $2 WHERE id = $1`, [
            playerId,
            documentId,
          ]);
        }
        photos += 1;
      }
    }
    lines.push(
      `  ${p.firstName} ${p.lastName} (${p.email}, ${ozId}, fiche ${p.status}) : ` +
        `${String(photos)} photo(s) posée(s) ; mot de passe : ${p.key} de .demo/demo.env.`,
    );
  }
  await db.query('COMMIT');
  process.stdout.write(`✓ Joueurs de démonstration prêts :\n${lines.join('\n')}\n`);
  if (storage === null) {
    process.stdout.write(
      '  ⚠ Stockage S3 local injoignable (port 8333) : fiches sans photo. Lancer le service `s3`\n' +
        '    de infra/docker/compose.dev.yml, puis relancer ce script.\n',
    );
  }
} catch (error) {
  await db.query('ROLLBACK');
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await db.end();
  storage?.destroy();
}
