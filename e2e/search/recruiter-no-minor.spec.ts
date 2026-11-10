import { createRequire } from 'node:module';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { login, registerAndConfirm, syntheticEmail, syntheticPassword } from '../auth/flows.js';

// Parcours n° 4 (design.md §7.5, EX-116 n° 6, CP-12) : un recruteur non vérifié KYC 3 lance une
// recherche et ne voit aucun mineur, ni par la recherche, ni par la fiche, ni par le QR. Témoin : un
// club vérifié trouve bien ce mineur publié. Le parcours n° 5 (recruteur KYC 3) attend le lot 1.10.

const fromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
interface SqlClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
const pg = fromApi('pg') as {
  Client: new (config: { connectionString: string | undefined }) => SqlClient;
};

let db: SqlClient;
test.beforeAll(async () => {
  db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
});
test.afterAll(async () => {
  await db.end();
});

const row = async <T>(sql: string, values: unknown[] = []): Promise<T> => {
  const [first] = (await db.query(sql, values)).rows as T[];
  if (first === undefined) throw new Error(`aucune ligne : ${sql}`);
  return first;
};

/** Compte connecté tenant `role` dans une organisation vérifiée de type `type` (2FA posée). */
async function member(api: APIRequestContext, role: string, type: string) {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await registerAndConfirm(api, email, password);
  const { id: userId } = await row<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    email,
  ]);
  // Connexion d'abord : rôle et 2FA posés ensuite, relus en base à chaque requête.
  const session = await login(api, email, password);
  expect(session.status()).toBe(200);
  const { accessToken } = (await session.json()) as { accessToken: string };
  const { id: organizationId } = await row<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ($1, 'Organisation synthétique', 'CM', 'verified') RETURNING id`,
    [type],
  );
  await db.query(`INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`, [
    userId,
    role,
    organizationId,
  ]);
  // Rôle à 2FA obligatoire : posée ici, l'enrôlement a son propre parcours (n° 8).
  await db.query(
    `UPDATE users SET totp_secret_encrypted = '\\x00', totp_enabled_at = now() WHERE id = $1`,
    [userId],
  );
  return { Authorization: `Bearer ${accessToken}` };
}

/** Fiche posée en base et OZ ID émis par un administrateur (back-office non livré). */
async function fiche(birthDate: string, guardianId: string | null): Promise<string> {
  const { id: issuer } = await row<{ id: string }>(
    `INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`,
    [syntheticEmail()],
  );
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [issuer]);
  const { id } = await row<{ id: string }>(
    `INSERT INTO players (first_name, last_name, birth_date, nationality, country, city,
       verification_status, guardian_id)
     VALUES ('Joueur', 'Parcoursquatre', $1::date, 'CM', 'CM', 'Douala', 'verified', $2)
     RETURNING id`,
    [birthDate, guardianId],
  );
  await db.query('BEGIN');
  await db.query(`SELECT set_config('oz.user_id', $1, true)`, [issuer]);
  const { oz_id: ozId } = await row<{ oz_id: string }>('SELECT oz_issue_oz_id($1, $2) AS oz_id', [
    id,
    String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'),
  ]);
  await db.query('COMMIT');
  if (guardianId !== null) {
    await db.query(
      `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
       VALUES ('guardian_profile_publication', 'v1', $1, $2)`,
      [id, guardianId],
    );
  }
  return ozId;
}

test('recruteur non vérifié → recherche → aucun mineur visible', async ({ request }) => {
  const { id: guardianUser } = await row<{ id: string }>(
    `INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`,
    [syntheticEmail()],
  );
  const { id: guardianId } = await row<{ id: string }>(
    `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
     VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
    [guardianUser],
  );
  const minor = await fiche('2012-06-07', guardianId);
  await fiche('1995-03-04', null);

  // Témoin : un club vérifié trouve le mineur publié.
  const club = await member(request, 'club', 'club');
  const found = await request.get('/players', { headers: club, params: { q: 'Parcoursquatre' } });
  expect(found.status()).toBe(200);
  const { items } = (await found.json()) as { items: { ozId: string }[] };
  expect(items.map((item) => item.ozId)).toContain(minor);

  // Recruteur d'une agence vérifiée, sans KYC 3 : aucune recherche, aucune fiche, aucun QR.
  const recruiter = await member(request, 'recruiter', 'agency');
  for (const response of [
    await request.get('/players', { headers: recruiter, params: { q: 'Parcoursquatre' } }),
    await request.get('/players', { headers: recruiter, params: { country: 'CM', ageMax: 17 } }),
    await request.get(`/players/${minor}`, { headers: recruiter }),
    await request.get(`/players/${minor}/qr.svg`, { headers: recruiter }),
    await request.get(`/players/${minor}/profile.pdf`, { headers: recruiter }),
  ]) {
    expect(response.status()).toBe(403);
    const body = await response.text();
    expect(body).not.toContain(minor);
    expect(body).not.toContain('Parcoursquatre');
  }
});
