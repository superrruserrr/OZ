import {
  abilityFor,
  isMinor,
  playerSubject,
  type ActorRole,
  type PlayerRecord,
  type RbacAction,
  type RbacRole,
} from '@oz/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// RLS de lecture des joueurs alignée sur les politiques CASL (lot 1.4b, D1). La base est le dernier
// rempart : une ligne n'est visible que si CASL en permet la lecture, au même instant.

let db: TestDatabase;
let app: AppConnection;
let now: Date;

const READ_ACTIONS: readonly RbacAction[] = [
  'profile.read',
  'player.read_public',
  'player.read_minor',
];

interface Org {
  readonly id: string;
  readonly verified: boolean;
}
interface Actor {
  readonly name: string;
  readonly id: string;
  readonly roles: readonly { readonly role: RbacRole; readonly org: Org | null }[];
}
interface Fixture {
  readonly name: string;
  readonly id: string;
  readonly record: PlayerRecord;
  /** Comptes liés à la ligne (titulaire, tuteur déclaré) : `players_owner` les laisse voir. */
  readonly linkedUserIds: readonly string[];
  readonly deleted: boolean;
}

const orgs: Record<string, Org> = {};
const actors: Actor[] = [];
const fixtures: Fixture[] = [];

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

let emails = 0;
const newUser = async (): Promise<string> =>
  (
    await one<{ id: string }>(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [
      `rbac-${String(++emails)}@example.test`,
    ])
  ).id;

const newOrg = async (type: string, status: string, deleted = false): Promise<Org> => {
  const row = await one<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status, deleted_at)
     VALUES ($1, $2, 'CM', $3::verification_status, $4) RETURNING id`,
    [type, `Organisation ${type} ${status}`, status, deleted ? new Date() : null],
  );
  return { id: row.id, verified: status === 'verified' && !deleted };
};

const newGuardian = async (userId: string | null, status: string): Promise<string> =>
  (
    await one<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
       VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', $2::verification_status) RETURNING id`,
      [userId, status],
    )
  ).id;

/** Date de naissance à `years` ans révolus, décalée de `days` jours (jour UTC de la base). */
const birthDate = (years: number, days = 0): Date => {
  const date = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + days),
  );
  return date;
};

const iso = (date: Date): string => date.toISOString().slice(0, 10);

interface PlayerSpec {
  readonly name: string;
  readonly birth: Date;
  readonly status?: string;
  readonly userId?: string | null;
  readonly guardian?: {
    readonly id: string;
    readonly userId: string | null;
    readonly verified: boolean;
  };
  readonly organization?: Org;
  readonly consent?: 'active' | 'revoked' | 'deleted';
  /** Tuteur qui a donné le consentement, s'il n'est plus le tuteur du joueur. */
  readonly consentBy?: { readonly id: string };
  readonly deleted?: boolean;
}

const newPlayer = async (spec: PlayerSpec): Promise<void> => {
  const status = spec.status ?? 'verified';
  const { id } = await one<{ id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
       verification_status, guardian_id, organization_id, deleted_at)
     VALUES ($1, 'Joueur', $2, $3::date, 'CM', 'CM', $4::verification_status, $5, $6, $7) RETURNING id`,
    [
      spec.userId ?? null,
      spec.name,
      iso(spec.birth),
      status,
      spec.guardian?.id ?? null,
      spec.organization?.id ?? null,
      spec.deleted === true ? new Date() : null,
    ],
  );
  if (spec.consent !== undefined && spec.guardian !== undefined) {
    const { id: consent } = await one<{ id: string }>(
      `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id, deleted_at)
       VALUES ('guardian_profile_publication', 'v1', $1, $2, $3) RETURNING id`,
      [id, (spec.consentBy ?? spec.guardian).id, spec.consent === 'deleted' ? new Date() : null],
    );
    if (spec.consent === 'revoked') {
      await db.query(`UPDATE consents SET revoked_at = clock_timestamp() WHERE id = $1`, [consent]);
    }
  }
  const verifiedGuardian = spec.guardian?.verified === true ? spec.guardian.userId : null;
  fixtures.push({
    name: spec.name,
    id,
    deleted: spec.deleted === true,
    linkedUserIds: [spec.userId, spec.guardian?.userId].filter(
      (value): value is string => typeof value === 'string',
    ),
    record: {
      userId: spec.userId ?? null,
      birthDate: spec.birth,
      verificationStatus: status,
      guardianUserId: verifiedGuardian,
      organizationId: spec.organization?.id ?? null,
      testedByOrganizationIds: [],
      hasPublicationConsent:
        spec.consent === 'active' &&
        spec.guardian?.verified === true &&
        (spec.consentBy === undefined || spec.consentBy.id === spec.guardian.id),
    },
  });
};

const newActor = async (
  name: string,
  roles: readonly { readonly role: RbacRole; readonly org: Org | null }[],
  id?: string,
): Promise<Actor> => {
  const userId = id ?? (await newUser());
  for (const { role, org } of roles) {
    await db.query(`INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`, [
      userId,
      role,
      org?.id ?? null,
    ]);
  }
  const actor = { name, id: userId, roles };
  actors.push(actor);
  return actor;
};

/** Rôles effectifs, comme `sessionAccess` : une organisation non vérifiée ne donne rien. */
const effectiveRoles = (actor: Actor): ActorRole[] =>
  actor.roles
    .filter(({ org }) => org === null || org.verified)
    .map(({ role, org }) => ({ role, organizationId: org?.id ?? null }));

const caslReads = (actor: Actor, fixture: Fixture): boolean => {
  const ability = abilityFor({
    userId: actor.id,
    roles: effectiveRoles(actor),
    isKyc3Verified: false,
  });
  const target = playerSubject(fixture.record, now);
  return READ_ACTIONS.some((action) => ability.can(action, target));
};

const visibleIds = async (userId: string): Promise<Set<string>> =>
  app.as(userId, async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM players');
    return new Set(rows.map((row) => row.id));
  });

const actor = (name: string): Actor => {
  const found = actors.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`acteur inconnu : ${name}`);
  return found;
};
const fixture = (name: string): Fixture => {
  const found = fixtures.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`joueur inconnu : ${name}`);
  return found;
};

const sees = async (who: string, row: string): Promise<boolean> =>
  (await visibleIds(actor(who).id)).has(fixture(row).id);

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  now = new Date((await one<{ now: Date }>('SELECT now() AS now')).now);

  orgs.academy = await newOrg('academy', 'verified');
  orgs.academyPending = await newOrg('academy', 'pending');
  orgs.club = await newOrg('club', 'verified');
  orgs.clubDeleted = await newOrg('club', 'verified', true);
  orgs.federation = await newOrg('federation', 'verified');
  orgs.federationSuspended = await newOrg('federation', 'suspended');
  orgs.center = await newOrg('center', 'verified');
  orgs.recruiter = await newOrg('recruiter', 'verified');
  orgs.agency = await newOrg('agency', 'verified');
  orgs.centerPending = await newOrg('center', 'in_review');
  orgs.clubDeclared = await newOrg('club', 'declared');

  const playerActor = await newActor('joueur', [{ role: 'player', org: null }]);
  const guardianActor = await newActor('tuteur', [{ role: 'guardian', org: null }]);
  const pendingGuardianActor = await newActor('tuteur non vérifié', [
    { role: 'guardian', org: null },
  ]);
  await newActor('académie', [{ role: 'academy', org: orgs.academy }]);
  await newActor('académie en attente', [{ role: 'academy', org: orgs.academyPending }]);
  await newActor('club', [{ role: 'club', org: orgs.club }]);
  await newActor('club supprimé', [{ role: 'club', org: orgs.clubDeleted }]);
  await newActor('fédération', [{ role: 'federation', org: orgs.federation }]);
  await newActor('fédération suspendue', [{ role: 'federation', org: orgs.federationSuspended }]);
  await newActor('centre', [{ role: 'center', org: orgs.center }]);
  await newActor('recruteur', [{ role: 'recruiter', org: orgs.recruiter }]);
  await newActor('agence', [{ role: 'recruiter', org: orgs.agency }]);
  await newActor('admin', [{ role: 'admin', org: null }]);
  await newActor('sans rôle', []);
  await newActor('club et fédération', [
    { role: 'club', org: orgs.club },
    { role: 'federation', org: orgs.federation },
  ]);
  const adminGuardian = await newActor('admin et tuteur', [
    { role: 'admin', org: null },
    { role: 'guardian', org: null },
  ]);
  const academyGuardian = await newActor('académie et tuteur', [
    { role: 'academy', org: orgs.academy },
    { role: 'guardian', org: null },
  ]);
  await newActor('centre en examen', [{ role: 'center', org: orgs.centerPending }]);
  await newActor('club déclaré', [{ role: 'club', org: orgs.clubDeclared }]);
  // Titulaire d'un profil sans rôle `player` : seul `players_owner` le lui montre.
  const federationOwner = await newActor('fédération titulaire', [
    { role: 'federation', org: orgs.federation },
  ]);
  const removed = await newActor('rôle retiré', [{ role: 'federation', org: orgs.federation }]);
  await db.query(`UPDATE user_roles SET deleted_at = now() WHERE user_id = $1`, [removed.id]);
  // Le titre « rôle retiré » ne garde aucun rôle effectif : il compte comme sans rôle.
  actors.splice(actors.indexOf(removed), 1, { ...removed, roles: [] });

  const verifiedGuardian = {
    id: await newGuardian(guardianActor.id, 'verified'),
    userId: guardianActor.id,
    verified: true,
  };
  const pendingGuardian = {
    id: await newGuardian(pendingGuardianActor.id, 'pending'),
    userId: pendingGuardianActor.id,
    verified: false,
  };
  const publisher = { id: await newGuardian(null, 'verified'), userId: null, verified: true };
  const unverifiedPublisher = {
    id: await newGuardian(null, 'declared'),
    userId: null,
    verified: false,
  };

  const deletedPublisher = {
    id: await newGuardian(null, 'verified'),
    userId: null,
    verified: false,
  };
  await db.query(`UPDATE guardians SET deleted_at = now() WHERE id = $1`, [deletedPublisher.id]);
  const secondPublisher = { id: await newGuardian(null, 'verified'), userId: null, verified: true };
  const adminGuardianRow = {
    id: await newGuardian(adminGuardian.id, 'verified'),
    userId: adminGuardian.id,
    verified: true,
  };
  const academyGuardianRow = {
    id: await newGuardian(academyGuardian.id, 'verified'),
    userId: academyGuardian.id,
    verified: true,
  };

  await newPlayer({ name: 'majeur vérifié', birth: birthDate(25) });
  await newPlayer({
    name: 'mineur tuteur de publication supprimé',
    birth: birthDate(14),
    guardian: deletedPublisher,
    consent: 'active',
  });
  await newPlayer({
    name: 'mineur consentement d’un ancien tuteur',
    birth: birthDate(14),
    guardian: secondPublisher,
    consent: 'active',
    consentBy: publisher,
  });
  await newPlayer({
    name: 'enfant de l’admin',
    birth: birthDate(9),
    status: 'declared',
    guardian: adminGuardianRow,
  });
  await newPlayer({
    name: 'enfant de l’académie au club',
    birth: birthDate(11),
    status: 'declared',
    guardian: academyGuardianRow,
    organization: orgs.club,
  });
  await newPlayer({
    name: 'profil de la fédération titulaire',
    birth: birthDate(40),
    status: 'declared',
    userId: federationOwner.id,
  });
  await newPlayer({ name: 'majeur déclaré', birth: birthDate(25), status: 'declared' });
  await newPlayer({ name: 'majeur suspendu', birth: birthDate(30), status: 'suspended' });
  await newPlayer({ name: 'majeur supprimé', birth: birthDate(25), deleted: true });
  await newPlayer({
    name: 'soi-même',
    birth: birthDate(20),
    status: 'declared',
    userId: playerActor.id,
  });
  await newPlayer({
    name: 'mineur publié',
    birth: birthDate(14),
    guardian: publisher,
    consent: 'active',
  });
  await newPlayer({ name: 'mineur sans consentement', birth: birthDate(14), guardian: publisher });
  await newPlayer({
    name: 'mineur consentement révoqué',
    birth: birthDate(14),
    guardian: publisher,
    consent: 'revoked',
  });
  await newPlayer({
    name: 'mineur consentement supprimé',
    birth: birthDate(14),
    guardian: publisher,
    consent: 'deleted',
  });
  await newPlayer({
    name: 'mineur tuteur non vérifié',
    birth: birthDate(14),
    guardian: unverifiedPublisher,
    consent: 'active',
  });
  await newPlayer({
    name: 'mineur déclaré avec consentement',
    birth: birthDate(14),
    status: 'declared',
    guardian: publisher,
    consent: 'active',
  });
  await newPlayer({
    name: 'mineur rattaché académie',
    birth: birthDate(12),
    status: 'declared',
    organization: orgs.academy,
  });
  await newPlayer({
    name: 'mineur rattaché club',
    birth: birthDate(12),
    status: 'declared',
    organization: orgs.club,
  });
  await newPlayer({
    name: 'mineur rattaché académie en attente',
    birth: birthDate(12),
    status: 'declared',
    organization: orgs.academyPending,
  });
  await newPlayer({
    name: 'mineur rattaché club supprimé',
    birth: birthDate(12),
    status: 'declared',
    organization: orgs.clubDeleted,
  });
  await newPlayer({
    name: 'majeur rattaché club non vérifié',
    birth: birthDate(22),
    status: 'declared',
    organization: orgs.club,
  });
  await newPlayer({ name: 'veille des 18 ans', birth: birthDate(18, 1) });
  await newPlayer({ name: 'jour des 18 ans', birth: birthDate(18) });
  await newPlayer({
    name: 'veille des 18 ans publié',
    birth: birthDate(18, 1),
    guardian: publisher,
    consent: 'active',
  });
  await newPlayer({
    name: 'enfant du tuteur',
    birth: birthDate(10),
    status: 'declared',
    guardian: verifiedGuardian,
  });
  await newPlayer({
    name: 'enfant devenu majeur',
    birth: birthDate(19),
    status: 'declared',
    guardian: verifiedGuardian,
  });
  await newPlayer({
    name: 'enfant du tuteur non vérifié',
    birth: birthDate(10),
    status: 'declared',
    guardian: pendingGuardian,
  });
});

afterAll(async () => {
  await app.end();
  await db.stop();
});

/** Écarts entre la RLS et CASL ; titulaire et tuteur déclaré : la RLS peut seulement être plus large. */
async function gridMismatches(): Promise<string[]> {
  const mismatches: string[] = [];
  for (const who of actors) {
    const visible = await visibleIds(who.id);
    for (const row of fixtures.filter((entry) => !entry.deleted)) {
      const rls = visible.has(row.id);
      const casl = caslReads(who, row);
      // Titulaire et tuteur déclaré : `players_owner` (inscription, lot 1.7) reste plus large que CASL.
      const linked = row.linkedUserIds.includes(who.id);
      if (linked ? casl && !rls : rls !== casl) {
        mismatches.push(`${who.name} × ${row.name} : RLS ${String(rls)}, CASL ${String(casl)}`);
      }
    }
  }
  return mismatches;
}

describe('RLS ⇔ CASL sur la grille acteurs × joueurs (D1)', () => {
  it('une ligne non supprimée est visible si et seulement si CASL en permet la lecture', async () => {
    expect(await gridMismatches()).toEqual([]);
  });

  it('la grille couvre des lectures permises et refusées pour chaque rôle tiers', () => {
    // L'administrateur lit tout (profile.read) : sa colonne est vérifiée par la grille ci-dessus.
    const third = ['académie', 'club', 'fédération', 'centre', 'joueur', 'tuteur'];
    for (const name of third) {
      const reads = fixtures
        .filter((row) => !row.deleted)
        .map((row) => caslReads(actor(name), row));
      expect(reads, name).toContain(true);
      expect(reads, name).toContain(false);
    }
  });
});

describe('politiques de lecture par rôle (tâche 1)', () => {
  it('académie et club lisent leurs mineurs rattachés, pas ceux des autres', async () => {
    expect(await sees('académie', 'mineur rattaché académie')).toBe(true);
    expect(await sees('académie', 'mineur rattaché club')).toBe(false);
    expect(await sees('club', 'mineur rattaché club')).toBe(true);
    expect(await sees('club', 'mineur rattaché académie')).toBe(false);
  });

  it('une organisation non vérifiée ou supprimée ne donne aucune ligne', async () => {
    for (const who of [
      'académie en attente',
      'club supprimé',
      'fédération suspendue',
      'rôle retiré',
    ]) {
      expect((await visibleIds(actor(who).id)).size, who).toBe(0);
    }
  });

  it('un mineur n’est lu d’un tiers que vérifié et publié avec un consentement actif d’un tuteur vérifié', async () => {
    for (const who of ['académie', 'club', 'fédération']) {
      expect(await sees(who, 'mineur publié'), who).toBe(true);
      for (const row of [
        'mineur sans consentement',
        'mineur consentement révoqué',
        'mineur consentement supprimé',
        'mineur tuteur non vérifié',
        'mineur déclaré avec consentement',
      ]) {
        expect(await sees(who, row), `${who} × ${row}`).toBe(false);
      }
    }
  });

  it('le centre ne lit aucun mineur tant qu’aucun test n’est enregistré (D8)', async () => {
    expect(await sees('centre', 'majeur vérifié')).toBe(true);
    expect(await sees('centre', 'mineur publié')).toBe(false);
  });

  it('recruteur, agence et compte sans rôle : aucune ligne (D4, CP-12)', async () => {
    for (const who of ['recruteur', 'agence', 'sans rôle']) {
      expect((await visibleIds(actor(who).id)).size, who).toBe(0);
    }
  });

  it('la majorité se décide au jour UTC des 18 ans', async () => {
    expect(await sees('fédération', 'veille des 18 ans')).toBe(false);
    expect(await sees('fédération', 'veille des 18 ans publié')).toBe(true);
    expect(await sees('fédération', 'jour des 18 ans')).toBe(true);
  });

  it('un joueur supprimé n’est lu d’aucun tiers', async () => {
    for (const who of ['joueur', 'tuteur', 'académie', 'club', 'fédération', 'centre']) {
      expect(await sees(who, 'majeur supprimé'), who).toBe(false);
    }
  });

  it('l’administrateur lit tout, en lecture seule', async () => {
    const admin = actor('admin').id;
    expect((await visibleIds(admin)).size).toBe(fixtures.length);
    const target = fixture('majeur vérifié').id;
    const updated = await app.as(
      admin,
      async (client) =>
        (await client.query(`UPDATE players SET city = 'Douala' WHERE id = $1`, [target])).rowCount,
    );
    expect(updated).toBe(0);
    await expect(
      app.as(admin, (client) =>
        client.query(
          `INSERT INTO players (first_name, last_name, birth_date, nationality, country)
           VALUES ('Admin', 'Écrit', '2000-01-01', 'CM', 'CM')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('un tiers ne modifie aucune ligne qu’il lit', async () => {
    const target = fixture('mineur rattaché club').id;
    const updated = await app.as(
      actor('club').id,
      async (client) =>
        (await client.query(`UPDATE players SET city = 'Yaoundé' WHERE id = $1`, [target]))
          .rowCount,
    );
    expect(updated).toBe(0);
  });

  it('les fonctions d’appui ne rendent qu’un booléen et lisent le contexte courant', async () => {
    const club = actor('club').id;
    const result = await app.as(
      club,
      async (client) =>
        (
          await client.query<{ club: boolean; admin: boolean }>(
            `SELECT oz_has_verified_role(ARRAY['club']::role_kind[]) AS club,
                  oz_has_verified_role(ARRAY['admin']::role_kind[]) AS admin`,
          )
        ).rows[0],
    );
    expect(result).toEqual({ club: true, admin: false });
    const anonymous = await app.as(
      null,
      async (client) =>
        (
          await client.query<{ any: boolean }>(
            `SELECT oz_has_verified_role(ARRAY['club','admin','player']::role_kind[]) AS any`,
          )
        ).rows[0],
    );
    expect(anonymous).toEqual({ any: false });
  });
});

describe('cas limites de la grille', () => {
  it('consentement d’un tuteur supprimé ou d’un ancien tuteur : aucun tiers', async () => {
    for (const who of ['académie', 'club', 'fédération']) {
      expect(await sees(who, 'mineur tuteur de publication supprimé'), who).toBe(false);
      expect(await sees(who, 'mineur consentement d’un ancien tuteur'), who).toBe(false);
    }
  });

  it('organisation de centre ou de club non vérifiée : aucune ligne', async () => {
    for (const who of ['centre en examen', 'club déclaré']) {
      expect((await visibleIds(actor(who).id)).size, who).toBe(0);
    }
  });

  it('comptes à plusieurs rôles : chaque rôle garde sa portée', async () => {
    expect(await sees('admin et tuteur', 'enfant de l’admin')).toBe(true);
    expect(await sees('académie et tuteur', 'enfant de l’académie au club')).toBe(true);
    expect(await sees('académie et tuteur', 'mineur rattaché club')).toBe(false);
    expect(await sees('fédération titulaire', 'profil de la fédération titulaire')).toBe(true);
  });

  it('oz_is_minor_at suit isMinor : 29 février, fins de mois, veille et jour des 18 ans', async () => {
    const births = [
      '2004-02-29',
      '2008-02-29',
      '2006-01-31',
      '2007-03-31',
      '2005-12-31',
      '2006-06-15',
    ];
    const pairs: [string, string][] = [];
    for (const birth of births) {
      const [year, month, day] = birth.split('-').map(Number) as [number, number, number];
      for (let offset = -3; offset <= 3; offset += 1) {
        const at = new Date(Date.UTC(year + 18, month - 1, day + offset));
        pairs.push([birth, iso(at)]);
      }
    }
    const rows = await db.query<{ birth: string; at: string; minor: boolean }>(
      `SELECT b::text AS birth, a::text AS at, oz_is_minor_at(b::date, a::date) AS minor
       FROM unnest($1::text[], $2::text[]) AS t(b, a)`,
      [pairs.map(([birth]) => birth), pairs.map(([, at]) => at)],
    );
    const differences = rows.filter(
      (row) =>
        row.minor !== isMinor(new Date(`${row.birth}T00:00:00Z`), new Date(`${row.at}T12:00:00Z`)),
    );
    expect(rows).toHaveLength(pairs.length);
    expect(differences).toEqual([]);
  });

  it('les fonctions d’appui ne sont exécutables que par oz_app (D-066)', async () => {
    const stranger = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('public', 'oz_player_published(uuid, uuid, verification_status)', 'EXECUTE') AS ok`,
    );
    expect(stranger[0]?.ok).toBe(false);
    for (const fn of [
      'oz_is_minor_at(date, date)',
      'oz_is_minor(date)',
      'oz_has_verified_role(role_kind[])',
      'oz_is_verified_member(uuid, role_kind[])',
      'oz_player_published(uuid, uuid, verification_status)',
    ]) {
      const [row] = await db.query<{ app: boolean; anyone: boolean }>(
        `SELECT has_function_privilege('oz_app', $1, 'EXECUTE') AS app,
                has_function_privilege('public', $1, 'EXECUTE') AS anyone`,
        [fn],
      );
      expect(row, fn).toEqual({ app: true, anyone: false });
    }
  });
});

describe('propriétaire soumis à la RLS (recette, production)', () => {
  it('les fonctions d’appui passent par le chemin privilégié et la grille reste alignée', async () => {
    // Comme oz_migrator : ni superutilisateur ni BYPASSRLS ; dernier test du fichier (non annulé).
    await db.query('CREATE ROLE oz_rls_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS');
    await db.query(
      'GRANT SELECT ON user_roles, organizations, guardians, consents TO oz_rls_owner_test',
    );
    for (const fn of [
      'oz_has_verified_role(role_kind[])',
      'oz_is_verified_member(uuid, role_kind[])',
      'oz_player_published(uuid, uuid, verification_status)',
    ]) {
      await db.query(`ALTER FUNCTION ${fn} OWNER TO oz_rls_owner_test`);
    }
    expect(await gridMismatches()).toEqual([]);
    expect(await sees('fédération', 'mineur publié')).toBe(true);
    expect(await sees('club', 'mineur rattaché club')).toBe(true);
  });
});
