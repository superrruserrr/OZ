import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { PLAYER_PHONE, playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// Recherche de joueurs (lot 1.14a, EX-116, CP-12, CP-14) sur la pile réelle : portée et critères
// par rôle, curseur signé, audit dans la transaction, limite de débit, journal sans critère. Les
// champs rendus par rôle sont prouvés contre la fiche par `player-payload.int.test.ts`.

const ORIGIN = 'http://localhost:3000';

let harness: AuthHarness;
let server: App;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let verifiedGuardian: PlayerFixtures['verifiedGuardian'];
let player: PlayerFixtures['player'];
let publish: PlayerFixtures['publish'];

interface Page {
  readonly items: Record<string, unknown>[];
  readonly nextCursor: string | null;
}
const search = (token: string, query: Record<string, string | number> = {}) =>
  request(server)
    .get('/players')
    .query(query)
    .set('Origin', ORIGIN)
    .set('Authorization', `Bearer ${token}`);
const audit = async (actor: string, action: string) =>
  (
    await harness.db.query<{ target_id: string | null; metadata: Record<string, unknown> }>(
      `SELECT target_id::text, metadata FROM audit_log
       WHERE actor_user_id = $1 AND action = $2 ORDER BY chain_position`,
      [actor, action],
    )
  ).rows;

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  ({ account, organization, verifiedGuardian, player, publish } = await playerFixtures(
    harness,
    'recherche',
  ));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('GET /players — portée', () => {
  it('club : vues publiques, sans téléphone ni date complète, sans cache', async () => {
    const club = await account('club', await organization('club'));
    const target = await player({ lastName: 'Portee' });
    const response = await search(club.token, { q: 'Portee' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const page = response.body as Page;
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ ozId: target.ozId, lastName: 'Portee' });
    expect(page.items[0]).not.toHaveProperty('birthDate');
    expect(page.items[0]).not.toHaveProperty('phone');
    expect(JSON.stringify(page)).not.toContain(PLAYER_PHONE);
  });

  it.each(['recruiter', 'player', 'guardian', 'center'] as const)(
    '%s (sans KYC 3 pour le recruteur) : 403, aucune ligne',
    async (role) => {
      const organizationId =
        role === 'recruiter' || role === 'center'
          ? await organization(role === 'center' ? 'center' : 'agency')
          : null;
      const reader = await account(role, organizationId);
      const response = await search(reader.token).expect(403);
      expect(response.body).not.toHaveProperty('items');
    },
  );

  it('administrateur : fiche complète sans téléphone', async () => {
    const admin = await account('admin');
    await player({ lastName: 'Complet' });
    const page = (await search(admin.token, { q: 'Complet' }).expect(200)).body as Page;
    expect(page.items[0]).toHaveProperty('birthDate');
    expect(page.items[0]).not.toHaveProperty('phone');
  });
});

describe('GET /players — critères (D1, D4)', () => {
  it('académie : taille, poids, pied, autre organisation refusés ; la sienne permise', async () => {
    const own = await organization('academy');
    const academy = await account('academy', own);
    const response = await search(academy.token, {
      heightMin: 170,
      foot: 'left',
      organizationId: await organization('club'),
    }).expect(403);
    expect(response.body).toMatchObject({
      code: 'SEARCH_CRITERIA_FORBIDDEN',
      details: [
        { field: 'heightMin', code: 'criteria_forbidden' },
        { field: 'foot', code: 'criteria_forbidden' },
        { field: 'organizationId', code: 'criteria_forbidden' },
      ],
    });
    await search(academy.token, { organizationId: own }).expect(200);
    await search(academy.token, { country: 'CM', ageMin: 16, position: 'striker' }).expect(200);
  });

  it('club : filtre sur sa propre organisation seulement (pas d’oracle du rattachement)', async () => {
    const own = await organization('club');
    const club = await account('club', own);
    const refused = await search(club.token, { organizationId: await organization('club') }).expect(
      403,
    );
    expect(refused.body).toMatchObject({
      code: 'SEARCH_CRITERIA_FORBIDDEN',
      details: [{ field: 'organizationId', code: 'criteria_forbidden' }],
    });
    await search(club.token, { organizationId: own, heightMin: 170, foot: 'left' }).expect(200);
  });

  it('bloc masqué : exclu du filtre, présent sans filtre', async () => {
    const club = await account('club', await organization('club'));
    await player({ lastName: 'Cachette', city: 'Bafoussam', visibility: { location: false } });
    const filtered = (await search(club.token, { q: 'Cachette', city: 'Bafoussam' }).expect(200))
      .body as Page;
    expect(filtered.items).toHaveLength(0);
    const plain = (await search(club.token, { q: 'Cachette' }).expect(200)).body as Page;
    expect(plain.items).toHaveLength(1);
    expect(plain.items[0]).not.toHaveProperty('city');
  });

  it('critère invalide : 422', async () => {
    const club = await account('club', await organization('club'));
    await search(club.token, { ageMin: 20, ageMax: 18 }).expect(422);
    await search(club.token, { sort: 'relevance' }).expect(422);
    await search(club.token, { unknown: 'x' }).expect(422);
  });
});

describe('GET /players — pagination (D6)', () => {
  it('curseur : pages successives, puis refus s’il est rejoué ailleurs', async () => {
    const club = await account('club', await organization('club'));
    for (const first of ['Anna', 'Bella', 'Carla'])
      await player({ firstName: first, lastName: 'Page' });
    const seen: unknown[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < 5; index += 1) {
      const query: Record<string, string | number> = { q: 'Page', limit: 1 };
      if (cursor !== null) query.cursor = cursor;
      const page = (await search(club.token, query).expect(200)).body as Page;
      seen.push(...page.items.map((item) => item.firstName));
      cursor = page.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toEqual(['Anna', 'Bella', 'Carla']);

    const first = (await search(club.token, { q: 'Page', limit: 1 }).expect(200)).body as Page;
    const replay = first.nextCursor ?? '';
    const other = await account('club', await organization('club'));
    const refused = [
      await search(other.token, { q: 'Page', limit: 1, cursor: replay }),
      await search(club.token, { q: 'Page', city: 'Douala', limit: 1, cursor: replay }),
      await search(club.token, { q: 'Page', sort: 'recent', limit: 1, cursor: replay }),
      await search(club.token, {
        q: 'Page',
        limit: 1,
        cursor: `${replay.slice(0, -1)}${replay.endsWith('A') ? 'B' : 'A'}`,
      }),
    ];
    for (const response of refused) {
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        details: [{ field: 'cursor', code: 'invalid_cursor' }],
      });
    }
  });
});

describe('GET /players — journal (D3, CP-14)', () => {
  it('chaque recherche : une entrée sans valeur de critère ; journal applicatif sans critère', async () => {
    const club = await account('club', await organization('club'));
    await player({ lastName: 'Journal', city: 'Kribi' });
    await search(club.token, { q: 'Journal', city: 'Kribi' }).expect(200);
    const entries = await audit(club.userId, 'player.search.performed');
    expect(entries).toEqual([
      { target_id: null, metadata: { sort: 'name', criteria: ['city', 'q'], results: 1 } },
    ]);
    const logs = JSON.stringify(harness.logs.lines());
    expect(logs).not.toContain('Journal');
    expect(logs).not.toContain('Kribi');
    // Club : lecture non journalisée, aucun mineur listé audité.
    expect(await audit(club.userId, 'player.profile.listed')).toEqual([]);
  });

  it('administrateur : une entrée par mineur listé, aucune pour un majeur', async () => {
    const admin = await account('admin');
    const guardian = await account('guardian');
    const guardianId = await verifiedGuardian(guardian.userId);
    const minor = await player({ lastName: 'Liste', birthDate: '2012-06-07', guardianId });
    await publish(minor.id, guardianId);
    await player({ lastName: 'Liste' });
    await search(admin.token, { q: 'Liste' }).expect(200);
    expect(await audit(admin.userId, 'player.profile.listed')).toEqual([
      { target_id: minor.id, metadata: {} },
    ]);
    expect((await audit(admin.userId, 'player.search.performed'))[0]?.metadata).toMatchObject({
      results: 2,
    });
  });

  it('club : mineur publié listé, non audité ; mineur non publié jamais listé', async () => {
    const club = await account('club', await organization('club'));
    const guardian = await account('guardian');
    const guardianId = await verifiedGuardian(guardian.userId);
    const published = await player({ lastName: 'Mineurs', birthDate: '2012-06-07', guardianId });
    await publish(published.id, guardianId);
    await player({ lastName: 'Mineurs', birthDate: '2013-06-07', guardianId });
    const page = (await search(club.token, { q: 'Mineurs' }).expect(200)).body as Page;
    expect(page.items.map((item) => item.ozId)).toEqual([published.ozId]);
  });
});

describe('GET /players — limite', () => {
  it('au-delà de la règle : 429 avec Retry-After', async () => {
    const club = await account('club', await organization('club'));
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      player_search_account: { limit: 1, windowSeconds: 60 },
    });
    await search(club.token).expect(200);
    const refused = await search(club.token).expect(429);
    expect(refused.headers['retry-after']).toMatch(/^\d+$/);
  });
});
