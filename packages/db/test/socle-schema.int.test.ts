import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Lot 1.1a — EX-101, plan §5.1. Le journal d'audit a ses propres tests (audit-log.int.test.ts).
const SOCLE_TABLES = [
  'users',
  'user_roles',
  'sessions',
  'organizations',
  'players',
  'guardians',
  'consents',
] as const;
/** Tables sensibles : traçabilité de l'auteur de chaque écriture (EX-101 n° 2). */
const SENSITIVE_TABLES = ['user_roles', 'organizations', 'players', 'guardians', 'consents'];
/** Données de personnes : suppression logique ou anonymisation seulement (EX-101 n° 5). */
const NO_PHYSICAL_DELETE = ['users', 'organizations', 'players', 'guardians', 'consents'];

const KEY = 'k'.repeat(40);

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});
afterAll(async () => {
  await db.stop();
});

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  is_identity: 'YES' | 'NO';
}

async function columns(table: string): Promise<Map<string, Column>> {
  const rows = await db.query<Column>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function insertUser(email: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO users (email) VALUES ($1) RETURNING id`,
    [email],
  );
  return row?.id ?? '';
}

async function insertPlayer(values: Record<string, unknown> = {}): Promise<string> {
  const data: Record<string, unknown> = {
    first_name: 'Awa',
    last_name: 'Synthétique',
    birth_date: '2010-05-04',
    nationality: 'CM',
    country: 'CM',
    ...values,
  };
  const keys = Object.keys(data);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO players (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
    Object.values(data),
  );
  return row?.id ?? '';
}

describe('règles transverses (plan §5.1, EX-101 n° 2)', () => {
  it.each(SOCLE_TABLES)(
    '%s : id UUIDv7, created_at, updated_at, deleted_at en timestamptz',
    async (table) => {
      const cols = await columns(table);
      expect(cols.get('id')).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
      expect(cols.get('id')?.column_default).toBe('oz_uuid_v7()');
      for (const name of ['created_at', 'updated_at']) {
        expect(cols.get(name)).toMatchObject({
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
        });
      }
      expect(cols.get('deleted_at')).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      });
    },
  );

  it.each(SENSITIVE_TABLES)('%s : created_by et updated_by référencent users', async (table) => {
    const refs = await db.query<{ column_name: string }>(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name)
       JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND ccu.table_name = 'users'`,
      [table],
    );
    expect(refs.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(['created_by', 'updated_by']),
    );
  });

  it('aucune colonne serial ni identity dans le schéma (EX-T20 n° 4)', async () => {
    const rows = await db.query<Column>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
       FROM information_schema.columns WHERE table_schema = 'public'
       AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')`,
    );
    expect(rows).toEqual([]);
  });

  it('updated_at avance à chaque modification', async () => {
    const id = await insertUser('horloge@example.test');
    const [before] = await db.query<{ updated_at: Date }>(
      'SELECT updated_at FROM users WHERE id = $1',
      [id],
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [id]);
    const [after] = await db.query<{ updated_at: Date }>(
      'SELECT updated_at FROM users WHERE id = $1',
      [id],
    );
    expect(after?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? 0);
  });
});

describe('contraintes (EX-101 n° 4)', () => {
  it('refuse un joueur de moins de 6 ans, accepte 6 ans pile', async () => {
    await expect(
      insertPlayer({ birth_date: new Date(Date.now() - 5 * 365 * 86_400_000) }),
    ).rejects.toThrow(/6 ans/);
    const [row] = await db.query<{ d: string }>(
      `SELECT (CURRENT_DATE - INTERVAL '6 years')::date::text AS d`,
    );
    await expect(insertPlayer({ birth_date: row?.d })).resolves.toBeTruthy();
  });

  it('refuse aussi un joueur rajeuni par mise à jour', async () => {
    const id = await insertPlayer();
    await expect(
      db.query(`UPDATE players SET birth_date = CURRENT_DATE - 30 WHERE id = $1`, [id]),
    ).rejects.toThrow(/6 ans/);
  });

  it('ne stocke aucun indicateur de minorité (recalculé à chaque requête, CP-15)', async () => {
    const cols = await columns('players');
    expect([...cols.keys()].filter((name) => /minor|age/.test(name))).toEqual([]);
  });

  it.each([
    ['un pays hors ISO alpha-2', { country: 'Cameroun' }],
    ['une nationalité en minuscules', { nationality: 'cm' }],
    ['une taille impossible', { height_cm: 40 }],
    ['un OZ ID mal formé', { oz_id: 'OZ-CM-26-7K4M9Q' }],
    ['un OZ ID contenant un U', { oz_id: 'OZ-CM-26-7K4U9Q-M' }],
  ])('refuse %s', async (_label, values) => {
    await expect(insertPlayer(values)).rejects.toThrow(/violates check constraint/);
  });

  it('OZ ID unique et immuable une fois posé (CP-03)', async () => {
    // L'OZ ID d'un joueur doit lui être réservé au registre (lot 1.2) : réservation, puis pose.
    const reserve = async (player: string, ozId: string): Promise<void> => {
      await db.query('INSERT INTO oz_id_registry (oz_id, player_id) VALUES ($1, $2)', [
        ozId,
        player,
      ]);
      await db.query('UPDATE players SET oz_id = $1 WHERE id = $2', [ozId, player]);
    };
    const id = await insertPlayer();
    await reserve(id, 'OZ-CM-26-7K4M9Q-M');
    await expect(
      db.query(`UPDATE players SET oz_id = 'OZ-CI-26-000000-4' WHERE id = $1`, [id]),
    ).rejects.toThrow(/immuable/);
    await expect(db.query(`UPDATE players SET oz_id = NULL WHERE id = $1`, [id])).rejects.toThrow(
      /immuable/,
    );
    const other = await insertPlayer();
    await expect(reserve(other, 'OZ-CM-26-7K4M9Q-M')).rejects.toThrow(/oz_id_registry_pkey/);
    await expect(reserve(other, 'OZ-SN-27-ZZZZZZ-9')).resolves.toBeUndefined();
  });

  it('statut de vérification limité au graphe du §5.4', async () => {
    await expect(insertPlayer({ verification_status: 'approved' })).rejects.toThrow(
      /invalid input value for enum/,
    );
  });

  it('email de connexion unique, stocké en minuscules', async () => {
    await insertUser('unique@example.test');
    await expect(insertUser('unique@example.test')).rejects.toThrow(/unique/i);
    await expect(insertUser('Majuscule@example.test')).rejects.toThrow(/check constraint/);
  });

  it('hachage de mot de passe au format Argon2id seulement', async () => {
    const id = await insertUser('hash@example.test');
    await expect(
      db.query(`UPDATE users SET password_hash = 'md5$abc' WHERE id = $1`, [id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `UPDATE users SET password_hash = '$argon2id$v=19$m=19456,t=2,p=1$c2VsZA$aGFjaGU' WHERE id = $1`,
        [id],
      ),
    ).resolves.toBeDefined();
  });

  it('rôle d’organisation : organisation exigée ; rôle personnel : organisation interdite', async () => {
    const user = await insertUser('roles@example.test');
    const [org] = await db.query<{ id: string }>(
      `INSERT INTO organizations (type, name, country) VALUES ('club', 'Club synthétique', 'CM') RETURNING id`,
    );
    await expect(
      db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'club')`, [user]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'player', $2)`,
        [user, org?.id],
      ),
    ).rejects.toThrow(/check constraint/);
    await db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'club', $2)`,
      [user, org?.id],
    );
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'player')`, [user]);
    await expect(
      db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'player')`, [user]),
    ).rejects.toThrow(/unique/i);
  });

  it('session : expiration postérieure à la création, IP tronquée', async () => {
    const user = await insertUser('session@example.test');
    const insert = (ip: string, expires: string): Promise<unknown> =>
      db.query(
        `INSERT INTO sessions (user_id, family_id, refresh_token_hash, ip, expires_at)
         VALUES ($1, oz_uuid_v7(), encode(gen_random_bytes(32), 'hex'), $2::inet, now() + $3::interval)`,
        [user, ip, expires],
      );
    await expect(insert('192.0.2.0/24', '-1 hour')).rejects.toThrow(/check constraint/);
    await expect(insert('192.0.2.17/32', '1 day')).rejects.toThrow(/check constraint/);
    await expect(insert('192.0.2.0/24', '1 day')).resolves.toBeDefined();
    await expect(insert('2001:db8:1::/48', '1 day')).resolves.toBeDefined();
  });

  it('consentement : horodatage serveur, révocation définitive', async () => {
    const user = await insertUser('consent@example.test');
    const player = await insertPlayer();
    const [consent] = await db.query<{ id: string; granted_at: Date }>(
      `INSERT INTO consents (player_id, granted_by_user_id, type, text_version, granted_at)
       VALUES ($1, $2, 'privacy_policy', '2026-10', '2000-01-01') RETURNING id, granted_at`,
      [player, user],
    );
    // Une date fournie par le client est ignorée (CP-13 : horodaté côté serveur).
    expect(Math.abs((consent?.granted_at.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
    await db.query('UPDATE consents SET revoked_at = now() WHERE id = $1', [consent?.id]);
    await expect(
      db.query('UPDATE consents SET revoked_at = NULL WHERE id = $1', [consent?.id]),
    ).rejects.toThrow(/révoqué/);
    await expect(
      db.query(`UPDATE consents SET text_version = '2027-01' WHERE id = $1`, [consent?.id]),
    ).rejects.toThrow(/immuable/);
    // W2 : ni masquage par suppression logique, ni changement d'auteur.
    for (const set of ['deleted_at = now()', `created_by = '${user}'`, `created_at = now()`]) {
      await expect(
        db.query(`UPDATE consents SET ${set} WHERE id = $1`, [consent?.id]),
      ).rejects.toThrow(/immuable/);
    }
  });
});

describe('suppression physique interdite (EX-101 n° 5)', () => {
  it.each(NO_PHYSICAL_DELETE)('%s : DELETE refusé, suppression logique acceptée', async (table) => {
    await expect(db.query(`DELETE FROM ${table}`)).rejects.toThrow(/suppression physique/);
    await expect(
      db.query(`UPDATE ${table} SET deleted_at = now() WHERE false`),
    ).resolves.toBeDefined();
  });
});

describe('colonnes chiffrées (plan §6.9, D2)', () => {
  it('aucune colonne en clair pour le numéro de pièce, le téléphone, les contacts du tuteur', async () => {
    const rows = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('players', 'guardians')
       AND column_name ~ '(phone|email|document_number)'`,
    );
    for (const row of rows) {
      expect(row.data_type, `${row.table_name}.${row.column_name}`).toBe('bytea');
      expect(row.column_name).toMatch(/_(encrypted|hmac)$/);
    }
    expect(rows.length).toBe(10);
  });

  it('un joueur se retrouve par l’empreinte de son numéro de pièce, jamais par sa valeur', async () => {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO players (first_name, last_name, birth_date, nationality, country,
         document_number_encrypted, document_number_hmac)
       VALUES ('Ibrahim', 'Synthétique', '2004-02-02', 'SN', 'SN',
         oz_encrypt('SYN-123456789', $1), oz_blind_index('SYN-123456789', $1)) RETURNING id`,
      [KEY],
    );
    const [found] = await db.query<{ id: string; clear: string }>(
      `SELECT id, oz_decrypt(document_number_encrypted, $1) AS clear FROM players
       WHERE document_number_hmac = oz_blind_index('SYN-123456789', $1)`,
      [KEY],
    );
    expect(found).toEqual({ id: row?.id, clear: 'SYN-123456789' });
  });
});

describe('created_at immuable (W7)', () => {
  it.each(SOCLE_TABLES.filter((t) => t !== 'consents'))(
    '%s : une mise à jour ne change pas created_at',
    async (table) => {
      const [row] = await db.query<{ id: string; created_at: Date }>(
        `SELECT id, created_at FROM ${table} LIMIT 1`,
      );
      if (row === undefined) return;
      await db.query(`UPDATE ${table} SET created_at = '2000-01-01' WHERE id = $1`, [row.id]);
      const [after] = await db.query<{ created_at: Date }>(
        `SELECT created_at FROM ${table} WHERE id = $1`,
        [row.id],
      );
      expect(after?.created_at).toEqual(row.created_at);
    },
  );
});
