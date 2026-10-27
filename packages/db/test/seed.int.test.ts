import { isValidOzId } from '@oz/core';
import { isSyntheticPerson, ORGANIZATION_TYPES, REFERENCE_DATE } from '@oz/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/seed.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Clés factices de la base de test : les colonnes chiffrées des profils seedés sont remplies.
const KEYS = { encryptionKey: 'e'.repeat(40), blindIndexKey: 'i'.repeat(40) };
const ROLES = [
  'player',
  'guardian',
  'academy',
  'club',
  'federation',
  'center',
  'recruiter',
  'admin',
];

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});
afterAll(async () => {
  await db.stop();
});

const count = async (sql: string): Promise<number> =>
  (await db.query<{ n: number }>(`SELECT (${sql})::int AS n`))[0]?.n ?? -1;

const snapshot = async (): Promise<Record<string, number>> => ({
  settings: await count('SELECT count(*) FROM system_settings'),
  users: await count('SELECT count(*) FROM users'),
  roles: await count('SELECT count(*) FROM user_roles'),
  organizations: await count('SELECT count(*) FROM organizations'),
  players: await count('SELECT count(*) FROM players'),
  guardians: await count('SELECT count(*) FROM guardians'),
  consents: await count('SELECT count(*) FROM consents'),
  ozIds: await count('SELECT count(*) FROM oz_id_registry'),
});

/** Mineur à la date de référence des fabriques : stable quel que soit le jour du test. */
const MINOR = `birth_date > (DATE '${REFERENCE_DATE}' - INTERVAL '18 years')`;

describe('seedDatabase (EX-006.2, EX-101 n° 8, D7)', () => {
  it('crée 500 joueurs, 30 organisations (5 par type) et des comptes pour chaque rôle', async () => {
    await seedDatabase({ databaseUrl: db.url, appEnv: 'local', ...KEYS });
    expect(await count('SELECT count(*) FROM players')).toBe(500);
    const types = await db.query<{ type: string; n: number }>(
      'SELECT type::text, count(*)::int AS n FROM organizations GROUP BY type ORDER BY type',
    );
    expect(types).toEqual([...ORGANIZATION_TYPES].sort().map((type) => ({ type, n: 5 })));
    const roles = await db.query<{ role: string }>(
      'SELECT DISTINCT role::text FROM user_roles ORDER BY 1',
    );
    expect(roles.map((r) => r.role)).toEqual([...ROLES].sort());
  });

  it('environ un tiers de mineurs, chacun avec un tuteur et un consentement parental', async () => {
    const minors = await count(`SELECT count(*) FROM players WHERE ${MINOR}`);
    expect(minors).toBeGreaterThanOrEqual(150);
    expect(minors).toBeLessThanOrEqual(185);
    expect(await count(`SELECT count(*) FROM players WHERE ${MINOR} AND guardian_id IS NULL`)).toBe(
      0,
    );
    expect(
      await count(`SELECT count(*) FROM players p WHERE ${MINOR} AND NOT EXISTS (
        SELECT 1 FROM consents c WHERE c.player_id = p.id AND c.granted_by_guardian_id = p.guardian_id
          AND c.type = 'guardian_data_processing')`),
    ).toBe(0);
    expect(await count('SELECT count(*) FROM guardians')).toBe(minors);
  });

  it('toutes les données sont reconnaissables comme synthétiques', async () => {
    expect(await count(`SELECT count(*) FROM users WHERE email NOT LIKE '%@example.test'`)).toBe(0);
    const people = await db.query<{ email: string | null; phone: string; document: string }>(
      `SELECT u.email, oz_decrypt(p.phone_encrypted, $1) AS phone,
              oz_decrypt(p.document_number_encrypted, $1) AS document
       FROM players p LEFT JOIN users u ON u.id = p.user_id`,
      [KEYS.encryptionKey],
    );
    for (const person of people) {
      expect(
        isSyntheticPerson({
          email: person.email ?? 'sans-compte@example.test',
          phone: person.phone,
          documentNumber: person.document,
        }),
        JSON.stringify(person),
      ).toBe(true);
    }
    const guardianEmails = await db.query<{ email: string }>(
      'SELECT oz_decrypt(email_encrypted, $1) AS email FROM guardians',
      [KEYS.encryptionKey],
    );
    expect(guardianEmails.every((g) => g.email.endsWith('@example.test'))).toBe(true);
    expect(
      await count(`SELECT count(*) FROM organizations WHERE registration_number NOT LIKE 'SYN-%'`),
    ).toBe(0);
  });

  it('les index aveugles correspondent aux valeurs chiffrées', async () => {
    expect(
      await count(`SELECT count(*) FROM players
        WHERE document_number_hmac <> oz_blind_index(oz_decrypt(document_number_encrypted, '${KEYS.encryptionKey}'), '${KEYS.blindIndexKey}')`),
    ).toBe(0);
  });

  it('chaque joueur a un OZ ID valide, unique, au pays de rattachement, réservé au registre', async () => {
    const rows = await db.query<{ oz_id: string | null; country: string }>(
      'SELECT oz_id, country FROM players',
    );
    expect(rows).toHaveLength(500);
    expect(rows.every((r) => r.oz_id !== null && isValidOzId(r.oz_id))).toBe(true);
    expect(rows.every((r) => r.oz_id?.slice(3, 5) === r.country)).toBe(true);
    expect(new Set(rows.map((r) => r.oz_id)).size).toBe(500);
    expect(await count('SELECT count(*) FROM oz_id_registry')).toBe(500);
  });

  it('est idempotent : une seconde exécution ne change ni ne duplique rien', async () => {
    const before = await snapshot();
    const settings = await db.query('SELECT key, value FROM system_settings ORDER BY key');
    await seedDatabase({ databaseUrl: db.url, appEnv: 'preview', ...KEYS });
    expect(await snapshot()).toEqual(before);
    expect(await db.query('SELECT key, value FROM system_settings ORDER BY key')).toEqual(settings);
  });

  it('marque le jeu comme synthétique dans les réglages', async () => {
    const [row] = await db.query<{ value: unknown }>(
      `SELECT value FROM system_settings WHERE key = 'seed.dataset'`,
    );
    expect(row?.value).toMatchObject({ synthetic: true, source: '@oz/testing' });
  });

  it('sans clés (poste fraîchement installé) : profils créés, colonnes chiffrées vides', async () => {
    const bare = await startDatabase();
    try {
      await migrateDeploy(bare);
      await seedDatabase({ databaseUrl: bare.url, appEnv: 'local' });
      const [row] = await bare.query<{ players: number; encrypted: number }>(
        `SELECT count(*)::int AS players,
                count(*) FILTER (WHERE phone_encrypted IS NOT NULL OR document_number_encrypted IS NOT NULL)::int AS encrypted
         FROM players`,
      );
      expect(row).toEqual({ players: 500, encrypted: 0 });
    } finally {
      await bare.stop();
    }
  });

  it.each(['staging', 'production'] as const)('refuse %s avant toute connexion', async (appEnv) => {
    await expect(
      seedDatabase({ databaseUrl: 'postgresql://x:y@127.0.0.1:1/none', appEnv, ...KEYS }),
    ).rejects.toThrow(/données synthétiques|R10/);
  });
});
