import type { RbacRole } from '@oz/auth';
import request from 'supertest';
import { formToken, tokenIn, type AuthHarness } from './auth-harness.js';

// Données synthétiques de la fiche joueur (lot 1.13a) : comptes connectés, organisations vérifiées,
// tuteurs vérifiés et joueurs dotés d'un OZ ID émis par un administrateur.

const PASSWORD = 'correct horse battery staple';
// Clés de `startAuthHarness` (DATABASE_ENCRYPTION_KEY, DATABASE_BLIND_INDEX_KEY).
const ENCRYPTION_KEY = 'e'.repeat(40);
const BLIND_INDEX_KEY = 'b'.repeat(40);
export const PLAYER_PHONE = '+237690000001';

export interface Account {
  readonly userId: string;
  readonly token: string;
}

export interface PlayerSeed {
  readonly userId?: string | null;
  readonly birthDate?: string;
  readonly status?: string;
  readonly guardianId?: string | null;
  readonly organizationId?: string | null;
  /** Recherche (lot 1.14a) : noms distincts par cas, ville, blocs masqués. */
  readonly firstName?: string;
  readonly lastName?: string;
  readonly city?: string;
  readonly visibility?: Readonly<Record<string, boolean>>;
}

export interface PlayerFixtures {
  readonly account: (role?: RbacRole, organizationId?: string | null) => Promise<Account>;
  readonly organization: (type: string) => Promise<string>;
  readonly verifiedGuardian: (userId: string) => Promise<string>;
  readonly player: (seed?: PlayerSeed) => Promise<{ id: string; ozId: string }>;
  /** Consentement de publication du tuteur (EX-T16 n° 3). */
  readonly publish: (playerId: string, guardianId: string) => Promise<void>;
}

export async function playerFixtures(
  harness: AuthHarness,
  prefix: string,
): Promise<PlayerFixtures> {
  const server = harness.app.getHttpServer();
  let counter = 0;
  const { rows } = await harness.db.query<{ id: string }>(
    `INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`,
    [`${prefix}-emetteur@example.test`],
  );
  const issuer = rows[0]?.id ?? '';
  await harness.db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [issuer]);

  return {
    account: async (role, organizationId = null) => {
      const address = `${prefix}-${String(++counter)}@example.test`;
      await request(server)
        .post('/auth/register')
        .send({ email: address, password: PASSWORD, formToken: formToken() })
        .expect(202);
      const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
      await request(server).post('/auth/verify-email').send({ token }).expect(200);
      const user = await harness.db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
        address,
      ]);
      const userId = user.rows[0]?.id ?? '';
      const login = await request(server)
        .post('/auth/login')
        .send({ email: address, password: PASSWORD })
        .expect(200);
      if (role !== undefined) {
        await harness.db.query(
          `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`,
          [userId, role, organizationId],
        );
        // Rôles à 2FA obligatoire : posée ici, le parcours d'enrôlement a sa propre suite.
        await harness.db.query(
          `UPDATE users SET totp_secret_encrypted = '\\x00', totp_enabled_at = now() WHERE id = $1`,
          [userId],
        );
      }
      return { userId, token: (login.body as { accessToken: string }).accessToken };
    },

    organization: async (type) => {
      const created = await harness.db.query<{ id: string }>(
        `INSERT INTO organizations (type, name, country, verification_status)
         VALUES ($1, 'Organisation synthétique', 'CM', 'verified') RETURNING id`,
        [type],
      );
      return created.rows[0]?.id ?? '';
    },

    verifiedGuardian: async (userId) => {
      const created = await harness.db.query<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
         VALUES ($1, 'Tuteur', 'Synthétique', 'father', 'CM', 'verified') RETURNING id`,
        [userId],
      );
      return created.rows[0]?.id ?? '';
    },

    player: async (seed = {}) => {
      const created = await harness.db.query<{ id: string }>(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, region,
           city, height_cm, weight_kg, primary_position, dominant_foot, verification_status,
           guardian_id, organization_id, phone_encrypted, phone_hmac)
         VALUES ($1, $9, $10, $2::date, 'CM', 'CM', 'Centre', $11, 180, 75,
           'striker', 'right', $3::verification_status, $4, $5, oz_encrypt($6, $7),
           oz_blind_index($6, $8))
         RETURNING id`,
        [
          seed.userId ?? null,
          seed.birthDate ?? '1995-03-04',
          seed.status ?? 'verified',
          seed.guardianId ?? null,
          seed.organizationId ?? null,
          PLAYER_PHONE,
          ENCRYPTION_KEY,
          BLIND_INDEX_KEY,
          seed.firstName ?? 'Joueur',
          seed.lastName ?? 'Synthétique',
          seed.city ?? 'Yaoundé',
        ],
      );
      const id = created.rows[0]?.id ?? '';
      if (seed.visibility !== undefined) {
        await harness.db.query(`UPDATE players SET visibility = $2::jsonb WHERE id = $1`, [
          id,
          JSON.stringify(seed.visibility),
        ]);
      }
      // Émis par un administrateur, comme le ferait le back-office (partie aléatoire déterministe).
      const client = await harness.db.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('oz.user_id', $1, true)`, [issuer]);
        const issued = await client.query<{ oz_id: string }>(
          'SELECT oz_issue_oz_id($1, $2) AS oz_id',
          [id, String(++counter).padStart(6, '0')],
        );
        await client.query('COMMIT');
        return { id, ozId: issued.rows[0]?.oz_id ?? '' };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    publish: async (playerId, guardianId) => {
      await harness.db.query(
        `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
         VALUES ('guardian_profile_publication', 'v1', $1, $2)`,
        [playerId, guardianId],
      );
    },
  };
}
