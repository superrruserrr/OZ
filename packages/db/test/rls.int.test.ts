import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient } from '../src/client.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Row Level Security forcée, refus par défaut (EX-101 n° 3, plan §3.5 ; décision D3 du lot 1.1).
// Les politiques fines par rôle arrivent au lot 1.4 (EX-104).
const EXPOSED_TABLES = [
  'users',
  'user_roles',
  'sessions',
  'organizations',
  'players',
  'guardians',
  'consents',
  'audit_chain_checks',
  'audit_log',
  // Lot 1.1b
  'document_duplicates',
  'document_uploads',
  'documents',
  'kyc_cases',
  'kyc_case_documents',
  'imports',
  'notifications',
  'subscriptions',
  // Lot 1.2
  'oz_id_registry',
  // Lot 1.3a
  'auth_tokens',
  'auth_recovery_codes',
];

let db: TestDatabase;
let app: AppConnection;
let alice: string;
let bob: string;
let alicePlayer: string;
let bobPlayer: string;
let club: string;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const users = await db.query<{ id: string; email: string }>(
    `INSERT INTO users (email) VALUES ('alice@example.test'), ('bob@example.test') RETURNING id, email`,
  );
  alice = users.find((u) => u.email.startsWith('alice'))?.id ?? '';
  bob = users.find((u) => u.email.startsWith('bob'))?.id ?? '';
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country) VALUES ('club', 'Club synthétique', 'CM') RETURNING id`,
  );
  club = org?.id ?? '';
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'club', $2), ($3, 'player', NULL)`,
    [alice, club, bob],
  );
  const players = await db.query<{ id: string; user_id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country)
     VALUES ($1, 'Alice', 'Synthétique', '2000-01-01', 'CM', 'CM'),
            ($2, 'Bob', 'Synthétique', '2001-01-01', 'CM', 'CM') RETURNING id, user_id`,
    [alice, bob],
  );
  alicePlayer = players.find((p) => p.user_id === alice)?.id ?? '';
  bobPlayer = players.find((p) => p.user_id === bob)?.id ?? '';
  app = await connectAsAppRole(db);
});
afterAll(async () => {
  await app.end();
  await db.stop();
});

describe('RLS activée et forcée sur chaque table exposée', () => {
  it('toutes les tables du schéma public, hors tables techniques, ont la RLS forcée', async () => {
    // Partitions comprises (W-c) : une partition se lit et s'écrit directement, sa RLS compte aussi.
    const rows = await db.query<{
      name: string;
      partition: boolean;
      enabled: boolean;
      forced: boolean;
    }>(
      `SELECT c.relname AS name, c.relispartition AS partition,
              c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
    );
    const technical = ['_prisma_migrations', 'system_settings', 'audit_chain_state'];
    const exposed = rows.filter((row) => !technical.includes(row.name));
    expect(
      exposed
        .filter((row) => !row.partition)
        .map((row) => row.name)
        .sort(),
    ).toEqual([...EXPOSED_TABLES].sort());
    expect(exposed.filter((row) => row.partition).length).toBeGreaterThanOrEqual(5);
    for (const row of exposed) {
      expect({ enabled: row.enabled, forced: row.forced }, row.name).toEqual({
        enabled: true,
        forced: true,
      });
    }
  });

  it('la tête de chaîne d’audit est invisible et intouchable pour le rôle applicatif', async () => {
    // RLS activée sans politique et non forcée : seul le déclencheur (propriétaire) l'écrit.
    const [flags] = await db.query<{ enabled: boolean; policies: number }>(
      `SELECT relrowsecurity AS enabled,
              (SELECT count(*)::int FROM pg_policy WHERE polrelid = c.oid) AS policies
       FROM pg_class c WHERE relname = 'audit_chain_state'`,
    );
    expect(flags).toEqual({ enabled: true, policies: 0 });
    const read = await app.as(alice, (c) => c.query('SELECT * FROM audit_chain_state'));
    expect(read.rows).toEqual([]);
    const write = await app.as(alice, (c) =>
      c.query(`UPDATE audit_chain_state SET last_position = 0`),
    );
    expect(write.rowCount).toBe(0);
  });
});

describe('sans contexte utilisateur : refus par défaut', () => {
  it.each(EXPOSED_TABLES)('%s : aucune ligne visible', async (table) => {
    const { rows } = await app.as(null, (c) => c.query(`SELECT 1 FROM ${table}`));
    expect(rows).toEqual([]);
  });

  it('aucune insertion possible', async () => {
    await expect(
      app.as(null, (c) => c.query(`INSERT INTO users (email) VALUES ('anonyme@example.test')`)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      app.as(null, (c) =>
        c.query(
          `INSERT INTO audit_log (action, target_type, reason) VALUES ('user.session.opened', 'user', 'x')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('avec contexte : chacun ses propres lignes', () => {
  it('un utilisateur ne voit que son compte et son profil joueur', async () => {
    const users = await app.as(alice, (c) => c.query<{ id: string }>('SELECT id FROM users'));
    expect(users.rows.map((r) => r.id)).toEqual([alice]);
    const players = await app.as(bob, (c) => c.query<{ id: string }>('SELECT id FROM players'));
    expect(players.rows.map((r) => r.id)).toEqual([bobPlayer]);
  });

  it('ne peut pas modifier le profil d’un autre', async () => {
    const result = await app.as(bob, (c) =>
      c.query(`UPDATE players SET city = 'Douala' WHERE id = $1`, [alicePlayer]),
    );
    expect(result.rowCount).toBe(0);
  });

  it('voit ses rôles mais ne peut ni s’en attribuer ni les modifier (CP-07)', async () => {
    const roles = await app.as(bob, (c) =>
      c.query<{ role: string }>('SELECT role FROM user_roles'),
    );
    expect(roles.rows.map((r) => r.role)).toEqual(['player']);
    await expect(
      app.as(bob, (c) =>
        c.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [bob]),
      ),
    ).rejects.toThrow(/row-level security/);
    const update = await app.as(bob, (c) =>
      c.query(`UPDATE user_roles SET role = 'admin' WHERE user_id = $1`, [bob]),
    );
    expect(update.rowCount).toBe(0);
  });

  it('voit les organisations auxquelles il appartient, et elles seules', async () => {
    const asAlice = await app.as(alice, (c) =>
      c.query<{ id: string }>('SELECT id FROM organizations'),
    );
    expect(asAlice.rows.map((r) => r.id)).toEqual([club]);
    const asBob = await app.as(bob, (c) => c.query('SELECT id FROM organizations'));
    expect(asBob.rows).toEqual([]);
  });

  it('un tuteur voit le joueur qui lui est rattaché', async () => {
    const [guardianUser] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('tuteur@example.test') RETURNING id`,
    );
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM') RETURNING id`,
      [guardianUser?.id],
    );
    const [minor] = await db.query<{ id: string }>(
      `INSERT INTO players (first_name, last_name, birth_date, nationality, country, guardian_id)
       VALUES ('Mineur', 'Synthétique', '2014-01-01', 'CM', 'CM', $1) RETURNING id`,
      [guardian?.id],
    );
    const seen = await app.as(guardianUser?.id ?? '', (c) =>
      c.query<{ id: string }>('SELECT id FROM players'),
    );
    expect(seen.rows.map((r) => r.id)).toEqual([minor?.id]);
  });

  it('écrit dans le journal en son nom seulement, sans pouvoir le relire', async () => {
    await app.as(bob, (c) =>
      c.query(
        `INSERT INTO audit_log (actor_user_id, action, target_type, reason) VALUES ($1, 'user.session.opened', 'user', 'connexion')`,
        [bob],
      ),
    );
    await expect(
      app.as(bob, (c) =>
        c.query(
          `INSERT INTO audit_log (actor_user_id, action, target_type, reason) VALUES ($1, 'user.session.opened', 'user', 'usurpation')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const { rows } = await app.as(bob, (c) => c.query('SELECT 1 FROM audit_log'));
    expect(rows).toEqual([]);
  });

  it('s’inscrit en posant son propre identifiant comme contexte', async () => {
    const id = (await db.query<{ id: string }>('SELECT oz_uuid_v7() AS id'))[0]?.id ?? '';
    await app.as(id, (c) =>
      c.query(`INSERT INTO users (id, email) VALUES ($1, 'nouveau@example.test')`, [id]),
    );
    await expect(
      app.as(id, (c) =>
        c.query(`INSERT INTO users (id, email) VALUES (oz_uuid_v7(), 'autre@example.test')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('withUserContext (Prisma)', () => {
  const appUrl = (): string => {
    const url = new URL(db.url);
    url.username = 'oz_app_test';
    url.password = 'oz_app_test';
    return url.toString();
  };

  it('pose le contexte pour la transaction seulement', async () => {
    const client = createDbClient(appUrl());
    try {
      const mine = await withUserContext(client, bob, (tx) =>
        tx.player.findMany({ select: { id: true } }),
      );
      expect(mine.map((p) => p.id)).toEqual([bobPlayer]);
      // Hors transaction, la connexion n'a plus de contexte : refus par défaut.
      expect(await client.player.findMany()).toEqual([]);
    } finally {
      await client.$disconnect();
    }
  });

  it('refuse un identifiant qui n’est pas un UUID', async () => {
    const client = createDbClient(appUrl());
    try {
      await expect(
        withUserContext(client, "' OR true --", (tx) => tx.player.findMany()),
      ).rejects.toThrow(/UUID/);
    } finally {
      await client.$disconnect();
    }
  });
});

describe('revue adversariale du lot 1.1a : colonnes d’autorité et usurpations', () => {
  it('B1 : chaque partition du journal a la RLS forcée, sans lecture ni écriture directe', async () => {
    const partitions = await db.query<{ name: string; enabled: boolean; forced: boolean }>(
      `SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
       WHERE i.inhparent = 'audit_log'::regclass`,
    );
    expect(partitions.length).toBeGreaterThanOrEqual(5);
    for (const p of partitions) expect(p, p.name).toMatchObject({ enabled: true, forced: true });
    const name = partitions.find((p) => p.name !== 'audit_log_default')?.name ?? '';
    const read = await app.as(bob, (c) => c.query(`SELECT 1 FROM ${name}`));
    expect(read.rows).toEqual([]);
    await expect(
      app.as(bob, (c) =>
        c.query(
          `INSERT INTO ${name} (actor_user_id, action, target_type, reason) VALUES ($1, 'user.session.opened', 'user', 'usurpation')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('B2 : un consentement ne vaut que pour soi ou pour le mineur de son propre tuteur', async () => {
    const [otherGuardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (first_name, last_name, relationship, country)
       VALUES ('Autre', 'Tuteur', 'father', 'CM') RETURNING id`,
    );
    const [otherMinor] = await db.query<{ id: string }>(
      `INSERT INTO players (first_name, last_name, birth_date, nationality, country, guardian_id)
       VALUES ('Autre', 'Mineur', '2013-01-01', 'CM', 'CM', $1) RETURNING id`,
      [otherGuardian?.id],
    );
    for (const sql of [
      // Au nom du tuteur d'un autre.
      `INSERT INTO consents (type, text_version, player_id, granted_by_user_id, granted_by_guardian_id)
       VALUES ('guardian_data_processing', 'v1', '${otherMinor?.id ?? ''}', '${bob}', '${otherGuardian?.id ?? ''}')`,
      // En son nom propre, pour le joueur d'un autre.
      `INSERT INTO consents (type, text_version, player_id, granted_by_user_id)
       VALUES ('guardian_data_processing', 'v1', '${otherMinor?.id ?? ''}', '${bob}')`,
    ]) {
      await expect(app.as(bob, (c) => c.query(sql))).rejects.toThrow(/row-level security/);
    }
    await expect(
      app.as(bob, (c) =>
        c.query(
          `INSERT INTO consents (type, text_version, player_id, granted_by_user_id) VALUES ('privacy_policy', 'v1', $1, $2)`,
          [bobPlayer, bob],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('B3 : ni réattribution du titulaire ou du tuteur, ni détachement du tuteur', async () => {
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (first_name, last_name, relationship, country)
       VALUES ('Tuteur', 'De Bob', 'legal_guardian', 'CM') RETURNING id`,
    );
    await db.query('UPDATE players SET guardian_id = $1 WHERE id = $2', [guardian?.id, bobPlayer]);
    for (const sql of [
      `UPDATE players SET user_id = '${alice}' WHERE id = '${bobPlayer}'`,
      `UPDATE players SET guardian_id = NULL WHERE id = '${bobPlayer}'`,
      `UPDATE players SET organization_id = '${club}' WHERE id = '${bobPlayer}'`,
    ]) {
      await expect(app.as(bob, (c) => c.query(sql))).rejects.toThrow(/autorité/);
    }
  });

  it('B3 : un tuteur ne crée pas de profil au nom d’un autre utilisateur', async () => {
    const [guardianUser] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('tuteur-b3@example.test') RETURNING id`,
    );
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'B3', 'mother', 'CM') RETURNING id`,
      [guardianUser?.id],
    );
    await expect(
      app.as(guardianUser?.id ?? '', (c) =>
        c.query(
          `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, guardian_id)
           VALUES ($1, 'Implanté', 'B3', '2014-01-01', 'CM', 'CM', $2)`,
          [alice, guardian?.id],
        ),
      ),
    ).rejects.toThrow(/autorité/);
    await expect(
      app.as(guardianUser?.id ?? '', (c) =>
        c.query(
          `INSERT INTO players (first_name, last_name, birth_date, nationality, country, guardian_id)
           VALUES ('Enfant', 'B3', '2014-01-01', 'CM', 'CM', $1)`,
          [guardian?.id],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    [
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
      VALUES ('{me}', 'X', 'Y', '2000-01-01', 'CM', 'CM', 'verified')`,
    ],
    [
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, oz_id)
      VALUES ('{me}', 'X', 'Y', '2000-01-01', 'CM', 'CM', 'OZ-CM-26-000000-0')`,
    ],
    [`UPDATE players SET verification_status = 'verified' WHERE user_id = '{me}'`],
    [`UPDATE players SET oz_id = 'OZ-CM-26-000000-0' WHERE user_id = '{me}'`],
    [`UPDATE users SET status = 'active' WHERE id = '{me}'`],
    [`UPDATE users SET email_verified_at = now() WHERE id = '{me}'`],
  ])('B4 : colonne d’autorité refusée à l’utilisateur — %s', async (sql) => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('b4-' || oz_uuid_v7() || '@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    if (sql.startsWith('UPDATE players')) {
      await db.query(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country)
         VALUES ($1, 'X', 'Y', '2000-01-01', 'CM', 'CM')`,
        [me],
      );
    }
    await expect(app.as(me, (c) => c.query(sql.replaceAll('{me}', me)))).rejects.toThrow(
      /autorité/,
    );
  });

  it('W3 : suppression logique par le titulaire, sans restauration possible', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('supprime@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    await app.as(me, (c) => c.query('UPDATE users SET deleted_at = now() WHERE id = $1', [me]));
    await expect(
      app.as(me, (c) => c.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [me])),
    ).rejects.toThrow(/autorité/);
  });

  it('W3 : un tuteur supprimé logiquement perd l’accès au mineur rattaché', async () => {
    const [guardianUser] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('tuteur-supprime@example.test') RETURNING id`,
    );
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'Supprimé', 'father', 'CM') RETURNING id`,
      [guardianUser?.id],
    );
    await db.query(
      `INSERT INTO players (first_name, last_name, birth_date, nationality, country, guardian_id)
       VALUES ('Enfant', 'W3', '2015-01-01', 'CM', 'CM', $1)`,
      [guardian?.id],
    );
    const id = guardianUser?.id ?? '';
    expect((await app.as(id, (c) => c.query('SELECT 1 FROM players'))).rows).toHaveLength(1);
    await db.query('UPDATE guardians SET deleted_at = now() WHERE id = $1', [guardian?.id]);
    expect((await app.as(id, (c) => c.query('SELECT 1 FROM players'))).rows).toEqual([]);
  });
});

describe('revue adversariale finale du lot 1.1a : identité certifiée et consentement parental', () => {
  const verifiedPlayer = async (): Promise<{ me: string; player: string }> => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('n1-' || oz_uuid_v7() || '@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    const [player] = await db.query<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
       VALUES ($1, 'Mineur', 'Vérifié', '2012-01-01', 'CM', 'CM', 'verified') RETURNING id`,
      [me],
    );
    return { me, player: player?.id ?? '' };
  };

  it.each([
    [`birth_date = '1990-01-01'`],
    [`first_name = 'Autre'`],
    [`last_name = 'Autre'`],
    [`document_number_hmac = '\\x01'::bytea, document_number_encrypted = '\\x02'::bytea`],
    [`nationality = 'FR'`],
  ])('N1 : un joueur vérifié ne réécrit pas son identité — %s', async (set) => {
    const { me, player } = await verifiedPlayer();
    await expect(
      app.as(me, (c) => c.query(`UPDATE players SET ${set} WHERE id = $1`, [player])),
    ).rejects.toThrow(/autorité/);
    // Les champs non certifiés restent modifiables.
    await expect(
      app.as(me, (c) => c.query(`UPDATE players SET city = 'Yaoundé' WHERE id = $1`, [player])),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('N1 : la date de naissance est figée même pour un profil seulement déclaré', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('n1-declare@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    const [player] = await db.query<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country)
       VALUES ($1, 'Déclaré', 'N1', '2012-01-01', 'CM', 'CM') RETURNING id`,
      [me],
    );
    await expect(
      app.as(me, (c) =>
        c.query(`UPDATE players SET birth_date = '1990-01-01' WHERE id = $1`, [player?.id]),
      ),
    ).rejects.toThrow(/autorité/);
    await expect(
      app.as(me, (c) =>
        c.query(`UPDATE players SET first_name = 'Corrigé' WHERE id = $1`, [player?.id]),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('N1 : un tuteur vérifié ne réécrit pas son identité', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('n1-tuteur@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
       VALUES ($1, 'Tuteur', 'Vérifié', 'mother', 'CM', 'verified') RETURNING id`,
      [me],
    );
    for (const set of [
      `first_name = 'Autre'`,
      `last_name = 'Autre'`,
      `document_number_hmac = '\\x01'::bytea, document_number_encrypted = '\\x02'::bytea`,
    ]) {
      await expect(
        app.as(me, (c) => c.query(`UPDATE guardians SET ${set} WHERE id = $1`, [guardian?.id])),
      ).rejects.toThrow(/autorité/);
    }
  });

  it.each(['guardian_data_processing', 'guardian_profile_publication'])(
    'N2 : un mineur ne s’accorde pas lui-même le consentement %s',
    async (type) => {
      const { me, player } = await verifiedPlayer();
      await expect(
        app.as(me, (c) =>
          c.query(
            `INSERT INTO consents (type, text_version, player_id, granted_by_user_id) VALUES ($1, 'v1', $2, $3)`,
            [type, player, me],
          ),
        ),
      ).rejects.toThrow(/consents_guardian_grantor_check/);
    },
  );

  it('N2 : le tuteur rattaché accorde le consentement parental', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('n2-tuteur@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'N2', 'father', 'CM') RETURNING id`,
      [me],
    );
    const [minor] = await db.query<{ id: string }>(
      `INSERT INTO players (first_name, last_name, birth_date, nationality, country, guardian_id)
       VALUES ('Enfant', 'N2', '2014-01-01', 'CM', 'CM', $1) RETURNING id`,
      [guardian?.id],
    );
    await expect(
      app.as(me, (c) =>
        c.query(
          `INSERT INTO consents (type, text_version, player_id, granted_by_user_id, granted_by_guardian_id)
           VALUES ('guardian_data_processing', 'v1', $1, $2, $3)`,
          [minor?.id, me, guardian?.id],
        ),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('N2 : un joueur ne peut pas être son propre tuteur, ni se consentir par ce biais', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('n2-faux-tuteur@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    const [guardian] = await app.as(
      me,
      async (c) =>
        (
          await c.query<{ id: string }>(
            `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
           VALUES ($1, 'Faux', 'Parent', 'mother', 'CM') RETURNING id`,
            [me],
          )
        ).rows,
    );
    await expect(
      app.as(me, (c) =>
        c.query(
          `INSERT INTO players (user_id, guardian_id, first_name, last_name, birth_date, nationality, country)
           VALUES ($1, $2, 'Mineur', 'N2', '2014-01-01', 'CM', 'CM')`,
          [me, guardian?.id],
        ),
      ),
    ).rejects.toThrow(/propre tuteur/);
    // Sans contexte non plus (invariant de la table, pas seulement du rôle applicatif).
    await expect(
      db.query(
        `INSERT INTO players (user_id, guardian_id, first_name, last_name, birth_date, nationality, country)
         VALUES ($1, $2, 'Mineur', 'N2', '2014-01-01', 'CM', 'CM')`,
        [me, guardian?.id],
      ),
    ).rejects.toThrow(/propre tuteur/);
  });

  it('N2 : un consentement parental désigne le mineur concerné', async () => {
    await expect(
      db.query(
        `INSERT INTO consents (type, text_version, granted_by_guardian_id)
         SELECT 'guardian_profile_publication', 'v1', id FROM guardians LIMIT 1`,
      ),
    ).rejects.toThrow(/consents_guardian_grantor_check/);
  });

  it('W-a : changer d’email efface sa vérification, avec ou sans contexte', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email, email_verified_at) VALUES ('wa@example.test', now()) RETURNING id`,
    );
    const me = user?.id ?? '';
    await app.as(me, (c) =>
      c.query(`UPDATE users SET email = 'wa-nouveau@example.test' WHERE id = $1`, [me]),
    );
    const [after] = await db.query<{ verified: Date | null }>(
      'SELECT email_verified_at AS verified FROM users WHERE id = $1',
      [me],
    );
    expect(after?.verified).toBeNull();
    // Chemin privilégié : la vérification de la nouvelle adresse peut être posée dans la même requête.
    await db.query(
      `UPDATE users SET email = 'wa-verifie@example.test', email_verified_at = now() WHERE id = $1`,
      [me],
    );
    await db.query(`UPDATE users SET email = 'wa-encore@example.test' WHERE id = $1`, [me]);
    const [last] = await db.query<{ verified: Date | null }>(
      'SELECT email_verified_at AS verified FROM users WHERE id = $1',
      [me],
    );
    expect(last?.verified).toBeNull();
  });
});
