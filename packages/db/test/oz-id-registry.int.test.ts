import { formatOzId, isValidOzId, CROCKFORD_ALPHABET } from '@oz/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Registre des OZ ID (lot 1.2, EX-102 n° 4 à 6, CP-02, CP-03) et premier chemin privilégié (D-059).

/** Mêmes vecteurs que packages/core/src/oz-id/oz-id.test.ts, calculés hors du code. */
const REFERENCE_OZ_IDS = [
  'OZ-CM-26-7K4M9Q-M',
  'OZ-CI-26-000000-4',
  'OZ-SN-27-ZZZZZZ-9',
  'OZ-FR-99-ABCDEF-0',
  'OZ-NG-00-1H3J5K-6',
  'OZ-GH-26-QRSTVW-4',
];
const REFUSED = /émission d'OZ ID refusée/;

let db: TestDatabase;
let app: AppConnection;
let holder: string;
let stranger: string;
let admin: string;
let member: string;
let club: string;
let year: string;

/** Pseudo-aléa déterministe : le test ne dépend pas de crypto. */
let seed = 7;
const nextValue = (): number => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return (seed >>> 16) % 32;
};
const randomPart = (): string =>
  Array.from({ length: 6 }, () => CROCKFORD_ALPHABET[nextValue()] ?? '0').join('');

async function insertPlayer(
  values: { user_id?: string; organization_id?: string; country?: string } = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO players (user_id, organization_id, first_name, last_name, birth_date, nationality, country)
     VALUES ($1, $2, 'Joueur', 'Synthétique', '2005-01-01', 'CM', $3) RETURNING id`,
    [values.user_id ?? null, values.organization_id ?? null, values.country ?? 'CM'],
  );
  return row?.id ?? '';
}

const issue = (user: string, player: string, random: string): Promise<string | null> =>
  app.as(user, async (c) => {
    const { rows } = await c.query<{ oz_id: string | null }>(
      'SELECT oz_issue_oz_id($1, $2) AS oz_id',
      [player, random],
    );
    return rows[0]?.oz_id ?? null;
  });

const ozIdOf = async (player: string): Promise<string | null> =>
  (await db.query<{ oz_id: string | null }>('SELECT oz_id FROM players WHERE id = $1', [player]))[0]
    ?.oz_id ?? null;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const users = await db.query<{ id: string; email: string }>(
    `INSERT INTO users (email) VALUES ('holder@example.test'), ('stranger@example.test'),
       ('admin@example.test'), ('member@example.test') RETURNING id, email`,
  );
  const byEmail = (prefix: string): string =>
    users.find((u) => u.email.startsWith(prefix))?.id ?? '';
  holder = byEmail('holder');
  stranger = byEmail('stranger');
  admin = byEmail('admin');
  member = byEmail('member');
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country) VALUES ('academy', 'Académie synthétique', 'CM') RETURNING id`,
  );
  club = org?.id ?? '';
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'admin', NULL), ($2, 'academy', $3)`,
    [admin, member, club],
  );
  const [now] = await db.query<{ yy: string }>(
    `SELECT to_char(now() AT TIME ZONE 'UTC', 'YY') AS yy`,
  );
  year = now?.yy ?? '';
  app = await connectAsAppRole(db);
});
afterAll(async () => {
  await app.end();
  await db.stop();
});

describe('calcul en base, identique à packages/core (D4)', () => {
  it('accepte les vecteurs de référence', async () => {
    const rows = await db.query<{ valid: boolean }>(
      'SELECT oz_ozid_is_valid(x) AS valid FROM unnest($1::text[]) AS x',
      [REFERENCE_OZ_IDS],
    );
    expect(rows.map((r) => r.valid)).toEqual(REFERENCE_OZ_IDS.map(() => true));
  });

  it('compose et valide comme le TypeScript sur 10 000 OZ ID et leurs altérations', async () => {
    const parts = Array.from({ length: 10_000 }, (_, i) => ({
      country: String.fromCharCode(65 + (i % 26), 65 + ((i * 7) % 26)),
      year: i % 100,
      random: randomPart(),
    }));
    const expected = parts.map((p) => formatOzId(p));
    const composed = await db.query<{ oz_id: string }>(
      `SELECT oz_ozid_compose(c, y, r) AS oz_id
       FROM unnest($1::text[], $2::text[], $3::text[]) WITH ORDINALITY AS t(c, y, r, n) ORDER BY n`,
      [
        parts.map((p) => p.country),
        parts.map((p) => String(p.year).padStart(2, '0')),
        parts.map((p) => p.random),
      ],
    );
    expect(composed.map((r) => r.oz_id)).toEqual(expected);

    // Une altération par OZ ID (position et symbole pseudo-aléatoires), contrôle compris.
    const altered = expected.map((ozId, i) => {
      const index = [9, 10, 11, 12, 13, 14, 16][i % 7] ?? 9;
      return (
        ozId.slice(0, index) + (CROCKFORD_ALPHABET[nextValue()] ?? '0') + ozId.slice(index + 1)
      );
    });
    const samples = [...expected, ...altered, 'OZ-CM-26-7K4M9Q-3', 'oz-cm-26-7k4m9q-m', ''];
    const verdicts = await db.query<{ valid: boolean }>(
      `SELECT oz_ozid_is_valid(x) AS valid FROM unnest($1::text[]) WITH ORDINALITY AS t(x, n) ORDER BY n`,
      [samples],
    );
    expect(verdicts.map((r) => r.valid)).toEqual(samples.map((s) => isValidOzId(s)));
  });

  it('rend NULL pour des parties mal formées', async () => {
    const [row] = await db.query<{ a: string | null; b: string | null; c: string | null }>(
      `SELECT oz_ozid_compose('cm', '26', '7K4M9Q') AS a, oz_ozid_compose('CM', '2', '7K4M9Q') AS b,
              oz_ozid_compose('CM', '26', '7K4M9U') AS c`,
    );
    expect(row).toEqual({ a: null, b: null, c: null });
  });
});

describe('émission par oz_issue_oz_id', () => {
  it('le titulaire obtient un OZ ID au pays de rattachement et à l’année UTC, journalisé', async () => {
    const player = await insertPlayer({ user_id: holder, country: 'SN' });
    const random = randomPart();
    const ozId = await issue(holder, player, random);
    expect(ozId).toBe(formatOzId({ country: 'SN', year: Number(year), random }));
    expect(await ozIdOf(player)).toBe(ozId);
    const registry = await db.query<{ player_id: string }>(
      'SELECT player_id FROM oz_id_registry WHERE oz_id = $1',
      [ozId],
    );
    expect(registry).toEqual([{ player_id: player }]);
    const audit = await db.query<{ actor_user_id: string; metadata: { oz_id: string } }>(
      `SELECT actor_user_id, metadata FROM audit_log WHERE action = 'player.oz_id.issued' AND target_id = $1`,
      [player],
    );
    expect(audit).toEqual([{ actor_user_id: holder, metadata: { oz_id: ozId } }]);
  });

  it('un membre de l’organisation de rattachement et un administrateur peuvent émettre', async () => {
    const academyPlayer = await insertPlayer({ organization_id: club });
    expect(await issue(member, academyPlayer, randomPart())).toMatch(/^OZ-CM-/);
    const orphan = await insertPlayer();
    expect(await issue(admin, orphan, randomPart())).toMatch(/^OZ-CM-/);
  });

  it('refuse un tiers, un joueur inconnu et l’absence de contexte, sans rien écrire', async () => {
    const player = await insertPlayer({ organization_id: club });
    await expect(issue(stranger, player, randomPart())).rejects.toThrow(REFUSED);
    await expect(
      issue(stranger, '01a17e67-0000-7000-8000-000000000000', randomPart()),
    ).rejects.toThrow(REFUSED);
    await expect(
      app.as(null, (c) => c.query('SELECT oz_issue_oz_id($1, $2)', [player, randomPart()])),
    ).rejects.toThrow(REFUSED);
    expect(await ozIdOf(player)).toBeNull();
  });

  it('refuse une seconde émission pour le même joueur (CP-03)', async () => {
    const player = await insertPlayer({ organization_id: club });
    const first = await issue(member, player, randomPart());
    await expect(issue(member, player, randomPart())).rejects.toThrow(/déjà émis/);
    // check_violation : distinct d'une collision, qui rend NULL sans erreur.
    await expect(issue(member, player, randomPart())).rejects.toMatchObject({ code: '23514' });
    expect(await ozIdOf(player)).toBe(first);
  });

  it('rend NULL sans rien écrire quand la partie aléatoire est déjà prise (reprise par l’appelant)', async () => {
    const random = randomPart();
    const first = await insertPlayer({ organization_id: club });
    const second = await insertPlayer({ organization_id: club });
    expect(await issue(member, first, random)).not.toBeNull();
    expect(await issue(member, second, random)).toBeNull();
    expect(await ozIdOf(second)).toBeNull();
  });

  it('un autre pays de rattachement donne un autre OZ ID pour la même partie aléatoire', async () => {
    const random = randomPart();
    const cameroon = await insertPlayer({ organization_id: club, country: 'CM' });
    const ghana = await insertPlayer({ organization_id: club, country: 'GH' });
    expect(await issue(member, cameroon, random)).toMatch(/^OZ-CM-/);
    expect(await issue(member, ghana, random)).toMatch(/^OZ-GH-/);
  });

  it('refuse une partie aléatoire mal formée', async () => {
    const player = await insertPlayer({ organization_id: club });
    for (const random of ['7K4M9', '7K4M9U', '7k4m9q', '7K4M9Q0']) {
      await expect(issue(member, player, random)).rejects.toThrow(/mal formée/);
    }
  });

  it('deux émissions concurrentes de la même partie aléatoire : une seule réussit (CP-02)', async () => {
    const random = randomPart();
    const players = await Promise.all(
      [1, 2, 3, 4].map(() => insertPlayer({ organization_id: club })),
    );
    const results = await Promise.all(players.map((p) => issue(member, p, random)));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});

describe('autorisation de l’émission (revue du lot 1.2)', () => {
  it('le tuteur actif émet pour le mineur rattaché ; un tuteur supprimé, non', async () => {
    const [guardianUser] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('tuteur-' || oz_uuid_v7() || '@example.test') RETURNING id`,
    );
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM') RETURNING id`,
      [guardianUser?.id],
    );
    const insertMinor = async (): Promise<string> => {
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO players (guardian_id, first_name, last_name, birth_date, nationality, country)
         VALUES ($1, 'Mineur', 'Synthétique', CURRENT_DATE - INTERVAL '12 years', 'CM', 'CM') RETURNING id`,
        [guardian?.id],
      );
      return row?.id ?? '';
    };
    const minor = await insertMinor();
    expect(await issue(guardianUser?.id ?? '', minor, randomPart())).toMatch(/^OZ-CM-/);
    const other = await insertMinor();
    await db.query('UPDATE guardians SET deleted_at = now() WHERE id = $1', [guardian?.id]);
    await expect(issue(guardianUser?.id ?? '', other, randomPart())).rejects.toThrow(REFUSED);
  });

  it('refuse un administrateur suspendu et le membre d’une organisation supprimée', async () => {
    const [suspended] = await db.query<{ id: string }>(
      `INSERT INTO users (email, status) VALUES ('suspendu-' || oz_uuid_v7() || '@example.test', 'suspended') RETURNING id`,
    );
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [suspended?.id]);
    await expect(issue(suspended?.id ?? '', await insertPlayer(), randomPart())).rejects.toThrow(
      REFUSED,
    );

    const [org] = await db.query<{ id: string }>(
      `INSERT INTO organizations (type, name, country) VALUES ('club', 'Club fermé', 'CM') RETURNING id`,
    );
    const [closedMember] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('ferme-' || oz_uuid_v7() || '@example.test') RETURNING id`,
    );
    await db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'club', $2)`,
      [closedMember?.id, org?.id],
    );
    const player = await insertPlayer({ organization_id: org?.id ?? '' });
    await db.query('UPDATE organizations SET deleted_at = now() WHERE id = $1', [org?.id]);
    await expect(issue(closedMember?.id ?? '', player, randomPart())).rejects.toThrow(REFUSED);
  });

  it('fige le pays de rattachement une fois l’OZ ID émis', async () => {
    const player = await insertPlayer({ organization_id: club });
    await db.query(`UPDATE players SET country = 'SN' WHERE id = $1`, [player]);
    await issue(member, player, randomPart());
    await expect(
      db.query(`UPDATE players SET country = 'CI' WHERE id = $1`, [player]),
    ).rejects.toThrow(/pays de rattachement figé/);
  });

  it('un SET ROLE vers un rôle dont l’application est membre n’ouvre pas le chemin privilégié', async () => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_reader_test') THEN
        CREATE ROLE oz_reader_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await db.query('GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA public TO oz_reader_test');
    await db.query('GRANT oz_reader_test TO oz_app_test');
    try {
      const victim = await insertPlayer({ organization_id: club });
      const seen = await app.as(stranger, async (c) => {
        await c.query('SET LOCAL ROLE oz_reader_test');
        const privileged = await c.query<{ p: boolean }>('SELECT oz_privileged() AS p');
        const players = await c.query('SELECT 1 FROM players');
        const registry = await c.query('SELECT 1 FROM oz_id_registry');
        return {
          privileged: privileged.rows[0]?.p,
          players: players.rowCount,
          registry: registry.rowCount,
        };
      });
      expect(seen).toEqual({ privileged: false, players: 0, registry: 0 });
      await expect(
        app.as(stranger, async (c) => {
          await c.query('SET LOCAL ROLE oz_reader_test');
          return (
            await c.query(`UPDATE players SET verification_status = 'pending' WHERE id = $1`, [
              victim,
            ])
          ).rowCount;
        }),
      ).resolves.toBe(0);
    } finally {
      await db.query('REVOKE oz_reader_test FROM oz_app_test');
    }
  });

  it('fonctionne sous un search_path vide (restauration pg_dump)', async () => {
    const player = await insertPlayer({ organization_id: club });
    const ozId = await app.as(member, async (c) => {
      await c.query(`SET LOCAL search_path = ''`);
      const { rows } = await c.query<{ oz_id: string }>(
        'SELECT public.oz_issue_oz_id($1, $2) AS oz_id',
        [player, randomPart()],
      );
      return rows[0]?.oz_id;
    });
    expect(isValidOzId(ozId)).toBe(true);
  });
});

describe('registre immuable (CP-03)', () => {
  let player: string;
  let ozId: string;

  beforeAll(async () => {
    player = await insertPlayer({ organization_id: club });
    ozId = (await issue(member, player, randomPart())) ?? '';
  });

  it('n’est ni lisible ni modifiable directement par l’application', async () => {
    await expect(
      app.as(holder, (c) => c.query('SELECT oz_id FROM oz_id_registry')).then((r) => r.rowCount),
    ).resolves.toBe(0);
    await expect(
      app.as(holder, (c) =>
        c.query('INSERT INTO oz_id_registry (oz_id, player_id) VALUES ($1, $2)', [
          formatOzId({ country: 'CM', year: 26, random: randomPart() }),
          player,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuse modification, suppression et vidage, même au propriétaire', async () => {
    await expect(
      db.query('UPDATE oz_id_registry SET issued_at = now() WHERE oz_id = $1', [ozId]),
    ).rejects.toThrow(/jamais modifié ni réattribué/);
    await expect(db.query('DELETE FROM oz_id_registry WHERE oz_id = $1', [ozId])).rejects.toThrow(
      /suppression physique interdite/,
    );
    await expect(db.query('TRUNCATE oz_id_registry CASCADE')).rejects.toThrow(
      /suppression physique interdite/,
    );
  });

  it('refuse un OZ ID au contrôle faux', async () => {
    const other = await insertPlayer();
    await expect(
      db.query('INSERT INTO oz_id_registry (oz_id, player_id) VALUES ($1, $2)', [
        'OZ-CM-26-7K4M9Q-3',
        other,
      ]),
    ).rejects.toThrow(/oz_id_registry_oz_id_check/);
  });

  it('un joueur ne porte que l’OZ ID réservé pour lui', async () => {
    const other = await insertPlayer();
    await expect(
      db.query('UPDATE players SET oz_id = $1 WHERE id = $2', [ozId, other]),
    ).rejects.toThrow(/players_oz_id_key|players_oz_id_registry_fkey/);
    await expect(
      db.query('UPDATE players SET oz_id = $1 WHERE id = $2', [
        formatOzId({ country: 'CM', year: 26, random: randomPart() }),
        other,
      ]),
    ).rejects.toThrow(/players_oz_id_registry_fkey/);
  });

  it('après suppression logique et anonymisation, l’OZ ID reste réservé et jamais réattribué', async () => {
    await db.query(
      `UPDATE players SET deleted_at = now(), first_name = 'Anonyme', last_name = 'Anonyme' WHERE id = $1`,
      [player],
    );
    expect(await ozIdOf(player)).toBe(ozId);
    const random = ozId.slice(9, 15);
    const next = await insertPlayer({ organization_id: club, country: 'CM' });
    if (ozId.slice(6, 8) === year) expect(await issue(member, next, random)).toBeNull();
    const kept = await db.query('SELECT 1 FROM oz_id_registry WHERE oz_id = $1', [ozId]);
    expect(kept).toHaveLength(1);
  });
});

describe('propriétaire sans privilège de superutilisateur (recette, production)', () => {
  it('oz_issue_oz_id passe la RLS forcée par ses seules politiques privilégiées', async () => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_owner_test') THEN
        CREATE ROLE oz_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await db.query('GRANT USAGE ON SCHEMA public TO oz_owner_test');
    await db.query('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO oz_owner_test');
    await db.query('ALTER FUNCTION oz_issue_oz_id(uuid, text) OWNER TO oz_owner_test');
    try {
      const player = await insertPlayer({ organization_id: club, country: 'NG' });
      expect(await issue(member, player, randomPart())).toMatch(/^OZ-NG-/);
      expect(await ozIdOf(player)).toMatch(/^OZ-NG-/);
    } finally {
      await db.query('ALTER FUNCTION oz_issue_oz_id(uuid, text) OWNER TO CURRENT_USER');
    }
  });
});
