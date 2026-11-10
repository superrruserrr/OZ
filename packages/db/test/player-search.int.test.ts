import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  searchPlayers,
  type PlayerSearchCriteria,
  type PlayerSearchOptions,
} from '../src/player-search.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Recherche en base (lot 1.14a, tâche 3) sous la RLS du lecteur, rôle `oz_app` : filtres, blocs
// masqués (D4), âge par année (D5), texte libre sur les noms (D2), pagination par clé.

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
const ids: Record<string, string> = {};
let thisYear = 0;
let issued = 0;

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};
const id = (name: string): string => ids[name] ?? '';

interface Player {
  readonly first: string;
  readonly last: string;
  readonly born: string;
  readonly status?: string;
  readonly city?: string;
  readonly region?: string;
  readonly height?: number;
  readonly position?: string;
  readonly foot?: string;
  readonly visibility?: Record<string, boolean>;
  readonly guardian?: string;
  readonly organization?: string;
}

async function player(name: string, p: Player): Promise<void> {
  const row = await one<{ id: string }>(
    `INSERT INTO players (first_name, last_name, birth_date, nationality, country, region, city,
       height_cm, weight_kg, primary_position, dominant_foot, verification_status, visibility,
       guardian_id, organization_id)
     VALUES ($1, $2, $3::date, 'CM', 'CM', $4, $5, $6, 70, $7::player_position, $8::dominant_foot,
       $9::verification_status, $10::jsonb, $11, $12)
     RETURNING id`,
    [
      p.first,
      p.last,
      p.born,
      p.region ?? 'Centre',
      p.city ?? 'Yaoundé',
      p.height ?? 175,
      p.position ?? 'striker',
      p.foot ?? 'right',
      p.status ?? 'verified',
      JSON.stringify(p.visibility ?? {}),
      p.guardian ?? null,
      p.organization ?? null,
    ],
  );
  ids[name] = row.id;
  await app.as(id('admin'), (c) =>
    c.query('SELECT oz_issue_oz_id($1, $2)', [row.id, String(++issued).padStart(6, '0')]),
  );
}

const search = (
  reader: string,
  criteria: PlayerSearchCriteria,
  options: Partial<PlayerSearchOptions> = {},
) =>
  withUserContext(client, id(reader), (tx) =>
    searchPlayers(tx, criteria, {
      sort: 'name',
      direction: 'asc',
      limit: 50,
      respectBlocks: reader !== 'admin',
      ...options,
    }),
  );
const names = async (...args: Parameters<typeof search>) =>
  (await search(...args)).records.map((record) => record.data.lastName);

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());
  thisYear = (await one<{ y: number }>(`SELECT extract(year FROM now())::int AS y`)).y;

  const user = async (email: string) =>
    (
      await one<{ id: string }>(
        `INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`,
        [email],
      )
    ).id;
  ids.admin = await user('admin@example.test');
  ids.federation = await user('federation@example.test');
  ids.guardianUser = await user('tuteur@example.test');
  const { id: federationOrg } = await one<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ('federation', 'Fédération synthétique', 'CM', 'verified') RETURNING id`,
  );
  const { id: academyOrg } = await one<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ('academy', 'Académie synthétique', 'CM', 'verified') RETURNING id`,
  );
  ids.academyOrg = academyOrg;
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id)
     VALUES ($1, 'admin', NULL), ($2, 'federation', $3), ($4, 'guardian', NULL)`,
    [id('admin'), id('federation'), federationOrg, id('guardianUser')],
  );
  const { id: guardian } = await one<{ id: string }>(
    `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
     VALUES ($1, 'Tuteur', 'Synthétique', 'father', 'CM', 'verified') RETURNING id`,
    [id('guardianUser')],
  );

  const adultYear = String(thisYear - 25);
  await player('eloise', { first: 'Éloïse', last: 'Ndongo', born: `${adultYear}-03-04` });
  await player('samuel', {
    first: 'Samuel',
    last: 'Ngassa',
    born: `${String(thisYear - 20)}-12-31`,
    city: 'Douala',
    region: 'Littoral',
    height: 190,
    position: 'goalkeeper',
    foot: 'left',
  });
  await player('hidden', {
    first: 'Discret',
    last: 'Masque',
    born: `${adultYear}-06-01`,
    city: 'Douala',
    region: 'Littoral',
    height: 190,
    position: 'goalkeeper',
    foot: 'left',
    visibility: { location: false, physical: false, sport: false },
  });
  await player('declared', {
    first: 'Non',
    last: 'Verifie',
    born: `${adultYear}-01-01`,
    status: 'declared',
  });
  await player('minor', {
    first: 'Petit',
    last: 'Publie',
    born: `${String(thisYear - 14)}-01-01`,
    guardian,
    organization: academyOrg,
  });
  await db.query(
    `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
     VALUES ('guardian_profile_publication', 'v1', $1, $2)`,
    [id('minor'), guardian],
  );
  await player('hiddenMinor', {
    first: 'Cache',
    last: 'Mineur',
    born: `${String(thisYear - 13)}-01-01`,
    guardian,
  });
  // Égalités de tri : cinq homonymes, nés la même année.
  for (let index = 0; index < 5; index += 1) {
    await player(`twin${String(index)}`, {
      first: 'Jean',
      last: 'Zoa',
      born: `${adultYear}-05-05`,
    });
  }
}, 240_000);

afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

describe('searchPlayers — RLS et lecteur', () => {
  it('fédération : majeurs vérifiés et mineur publié, jamais un non vérifié ni un mineur non publié', async () => {
    const found = await names('federation', {});
    expect(found).toContain('Ndongo');
    expect(found).toContain('Publie');
    expect(found).not.toContain('Verifie');
    expect(found).not.toContain('Mineur');
  });

  it('administrateur : toutes les fiches ayant un OZ ID', async () => {
    const found = await names('admin', {});
    expect(found).toEqual(expect.arrayContaining(['Verifie', 'Mineur', 'Publie']));
  });

  it('colonnes de fiche : entrée de CASL, badge, blocs', async () => {
    const page = await search('federation', { q: 'masque' });
    expect(page.records).toHaveLength(1);
    expect(page.records[0]).toMatchObject({
      id: id('hidden'),
      access: { verificationStatus: 'verified', deletionPending: false },
      kycLevel: 2,
      visibility: { location: false, physical: false, sport: false },
    });
  });
});

describe('searchPlayers — filtres', () => {
  it('ville et région sans accents ni casse', async () => {
    expect(await names('federation', { city: 'yaounde' })).toContain('Ndongo');
    expect(await names('federation', { region: 'LITTORAL' })).toEqual(['Ngassa']);
  });

  it('D4 : un filtre sur un bloc masqué exclut le joueur, pas l’absence de filtre', async () => {
    expect(await names('federation', { city: 'Douala' })).toEqual(['Ngassa']);
    expect(await names('federation', { heightMin: 185 })).toEqual(['Ngassa']);
    expect(await names('federation', { position: 'goalkeeper' })).toEqual(['Ngassa']);
    expect(await names('federation', { foot: 'left' })).toEqual(['Ngassa']);
    expect(await names('federation', { country: 'CM' })).toContain('Masque');
    // L'administrateur lit la fiche complète : le bloc ne l'exclut pas.
    expect(await names('admin', { city: 'Douala' })).toEqual(['Masque', 'Ngassa']);
  });

  it('D5 : âge par année de naissance, né le 31 décembre compris', async () => {
    expect(await names('federation', { ageMin: 20, ageMax: 20 })).toEqual(['Ngassa']);
    expect(await names('federation', { ageMax: 15 })).toEqual(['Publie']);
    expect(await names('federation', { ageMin: 21, ageMax: 24 })).toEqual([]);
  });

  it('niveau de badge minimal, organisation', async () => {
    expect(await names('admin', { verificationLevel: 2 })).not.toContain('Verifie');
    expect(await names('admin', { organizationId: id('academyOrg') })).toEqual(['Publie']);
    expect(await names('admin', { organizationId: 'pas-un-uuid' })).toEqual([]);
  });

  it('D2 : texte libre sur prénom et nom, accents et casse ignorés, jamais la ville', async () => {
    expect(await names('federation', { q: 'eloise' })).toEqual(['Ndongo']);
    expect(await names('federation', { q: 'ELOÏSE NDONGO' })).toEqual(['Ndongo']);
    expect(await names('federation', { q: 'ngasa' })).toEqual(['Ngassa']);
    expect(await names('federation', { q: 'Douala' })).toEqual([]);
  });
});

describe('searchPlayers — tri et pagination par clé', () => {
  const walk = async (
    options: Partial<PlayerSearchOptions>,
    criteria: PlayerSearchCriteria = {},
  ) => {
    const all = await search('admin', criteria, { ...options, limit: 50 });
    const seen: string[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await search('admin', criteria, { ...options, limit: 2, afterId });
      seen.push(...result.records.map((record) => record.id));
      if (!result.hasMore) break;
      afterId = result.records.at(-1)?.id;
    }
    return { expected: all.records.map((record) => record.id), seen };
  };

  it.each([
    { sort: 'name', direction: 'asc' },
    { sort: 'name', direction: 'desc' },
    { sort: 'birthYear', direction: 'asc' },
    { sort: 'birthYear', direction: 'desc' },
    { sort: 'recent', direction: 'desc' },
  ] as const)('$sort $direction : pages de 2 sans doublon ni trou', async (options) => {
    const { expected, seen } = await walk(options);
    expect(expected.length).toBeGreaterThan(8);
    expect(seen).toEqual(expected);
  });

  it('pertinence : ordre par similarité, pages sans doublon ni trou', async () => {
    const { expected, seen } = await walk({ sort: 'relevance', direction: 'desc' }, { q: 'zoa' });
    expect(expected).toHaveLength(5);
    expect(seen).toEqual(expected);
  });

  it('dernière ligne devenue invisible du lecteur : signalée, aucune ligne', async () => {
    const page = await search('federation', {}, { afterId: id('declared') });
    expect(page).toEqual({ records: [], hasMore: false, anchorLost: true });
  });

  it('tri par nom désaccentué', async () => {
    const found = await names('admin', { country: 'CM' }, { sort: 'name' });
    expect(found.indexOf('Ndongo')).toBeLessThan(found.indexOf('Ngassa'));
  });

  it('position de page mal formée : refus', async () => {
    await expect(search('admin', {}, { afterId: 'x' })).rejects.toThrow(/position de page/);
    await expect(search('admin', {}, { sort: 'relevance' })).rejects.toThrow(/pertinence/);
  });
});
