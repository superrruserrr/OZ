import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { PLAYER_PHONE, playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// Recherches sauvegardées et export CSV (lot 1.14b, EX-116 n° 3, 4, 7, CP-12, CP-14, CP-33) sur la
// pile réelle : portée par rôle, limite de 20, quota du palier par organisation, filigrane, audit
// dans la transaction, journal applicatif sans critère. Le CSV = la vue est prouvé par
// `player-payload.int.test.ts`.

const ORIGIN = 'http://localhost:3000';
/** Sauvegarde inexistante. */
const UNKNOWN_SAVED_SEARCH = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

let harness: AuthHarness;
let server: App;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let verifiedGuardian: PlayerFixtures['verifiedGuardian'];
let player: PlayerFixtures['player'];
let publish: PlayerFixtures['publish'];

const auth = (token: string) => (req: request.Test) =>
  req.set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`);
const exportCsv = (token: string, query: Record<string, string | number> = {}) =>
  auth(token)(request(server).get('/players/export.csv').query(query));
const saved = {
  list: (token: string) => auth(token)(request(server).get('/players/saved-searches')),
  create: (token: string, body: unknown) =>
    auth(token)(
      request(server)
        .post('/players/saved-searches')
        .send(body as object),
    ),
  remove: (token: string, id: string) =>
    auth(token)(request(server).delete(`/players/saved-searches/${id}`)),
};
const audit = async (actor: string, action: string) =>
  (
    await harness.db.query<{ target_id: string | null; metadata: Record<string, unknown> }>(
      `SELECT target_id::text, metadata FROM audit_log
       WHERE actor_user_id = $1 AND action = $2 ORDER BY chain_position`,
      [actor, action],
    )
  ).rows;
/** Lignes de données du CSV (sans BOM, filigrane ni en-têtes). */
const csvLines = (text: string): string[] => text.replace(/^\uFEFF/, '').split('\r\n');

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  ({ account, organization, verifiedGuardian, player, publish } = await playerFixtures(
    harness,
    'export',
  ));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('recherches sauvegardées', () => {
  it('créer, lister, supprimer ; privées au compte ; sans cache', async () => {
    const club = await account('club', await organization('club'));
    const other = await account('club', await organization('club'));
    const created = await saved
      .create(club.token, {
        name: ' Attaquants U19 ',
        criteria: { ageMax: 19, position: 'striker', q: 'Ndo' },
        sort: 'relevance',
      })
      .expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toMatchObject({
      name: 'Attaquants U19',
      criteria: { ageMax: 19, position: 'striker', q: 'Ndo' },
      sort: 'relevance',
    });
    const id = (created.body as { id: string }).id;
    const list = await saved.list(club.token).expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect((list.body as { items: unknown[] }).items).toEqual([created.body]);
    expect((await saved.list(other.token).expect(200)).body).toEqual({ items: [] });
    await saved.remove(other.token, id).expect(404);
    await saved.remove(club.token, id).expect(204);
    await saved.remove(club.token, id).expect(404);
    await saved.remove(club.token, 'pas-un-uuid').expect(422);
    // Aucun nom ni critère au journal applicatif.
    const logs = JSON.stringify(harness.logs.lines());
    expect(logs).not.toContain('Attaquants');
    expect(logs).not.toContain('Ndo');
  });

  it('académie : sauvegarde sans critère avancé ; critère réservé : 403', async () => {
    const own = await organization('academy');
    const academy = await account('academy', own);
    const refused = await saved
      .create(academy.token, { name: 'Grands', criteria: { heightMin: 180 } })
      .expect(403);
    expect(refused.body).toMatchObject({
      code: 'SEARCH_CRITERIA_FORBIDDEN',
      details: [{ field: 'heightMin', code: 'criteria_forbidden' }],
    });
    await saved
      .create(academy.token, { name: 'Les miens', criteria: { organizationId: own } })
      .expect(201);
  });

  it.each(['player', 'guardian', 'center', 'recruiter'] as const)(
    '%s (sans KYC 3 pour le recruteur) : 403 sur chaque route',
    async (role) => {
      const organizationId =
        role === 'recruiter' || role === 'center'
          ? await organization(role === 'center' ? 'center' : 'agency')
          : null;
      const reader = await account(role, organizationId);
      await saved.list(reader.token).expect(403);
      await saved.create(reader.token, { name: 'x' }).expect(403);
      await saved.remove(reader.token, UNKNOWN_SAVED_SEARCH).expect(403);
    },
  );

  it('20 au plus : la 21e, 409 `SAVED_SEARCH_LIMIT` ; corps invalide : 422', async () => {
    const club = await account('club', await organization('club'));
    for (let i = 0; i < 20; i += 1) {
      await saved.create(club.token, { name: `Recherche ${String(i)}` }).expect(201);
    }
    const refused = await saved.create(club.token, { name: '21e' }).expect(409);
    expect(refused.body).toMatchObject({ code: 'SAVED_SEARCH_LIMIT' });
    await saved.create(club.token, { name: '' }).expect(422);
    await saved.create(club.token, { name: 'x', criteria: { limit: 5 } }).expect(422);
    await saved.create(club.token, { name: 'x', sort: 'relevance' }).expect(422);
  });

  it('au-delà de la règle de débit : 429 avec Retry-After', async () => {
    const club = await account('club', await organization('club'));
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      player_saved_search_account: { limit: 1, windowSeconds: 60 },
    });
    await saved.create(club.token, { name: 'Une' }).expect(201);
    const refused = await saved.create(club.token, { name: 'Deux' }).expect(429);
    expect(refused.headers['retry-after']).toMatch(/^\d+$/);
  });
});

describe('GET /players/export.csv — portée (D1)', () => {
  it('club : CSV filigrané, pièce jointe neutre, sans téléphone, sans cache', async () => {
    const club = await account('club', await organization('club'));
    const target = await player({ lastName: 'Exporte', city: 'Limbe' });
    const response = await exportCsv(club.token, { q: 'Exporte' }).expect(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe('attachment; filename="oz-recherche.csv"');
    expect(response.headers['cache-control']).toBe('no-store');
    const lines = csvLines(response.text);
    expect(lines[0]).toMatch(
      /^# OZ Football ID — export [0-9a-f-]{36} — \w\*\*\*@example\.test \(club\) — \d{4}-\d{2}-\d{2}T[\d:.]+Z — 1 lignes$/,
    );
    expect(lines[1]?.startsWith('ref,ozId,')).toBe(true);
    expect(lines[2]).toContain(target.ozId);
    expect(lines[2]).toMatch(/^[0-9a-f]{12},/);
    expect(response.text).not.toContain(PLAYER_PHONE);
    expect(response.headers['content-disposition']).not.toContain(target.ozId);
  });

  it('académie : 403, rien inscrit ni audité', async () => {
    const academy = await account('academy', await organization('academy'));
    const response = await exportCsv(academy.token).expect(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(await audit(academy.userId, 'player.search.exported')).toEqual([]);
  });

  it.each(['player', 'guardian', 'center', 'recruiter'] as const)(
    '%s (sans KYC 3 pour le recruteur) : 403, aucune ligne',
    async (role) => {
      const organizationId =
        role === 'recruiter' || role === 'center'
          ? await organization(role === 'center' ? 'center' : 'agency')
          : null;
      const reader = await account(role, organizationId);
      const response = await exportCsv(reader.token).expect(403);
      expect(response.text).not.toContain('OZ-');
    },
  );

  it('critère réservé à une autre organisation : 403 ; critère invalide ou pagination : 422', async () => {
    const club = await account('club', await organization('club'));
    await exportCsv(club.token, { organizationId: await organization('club') }).expect(403);
    await exportCsv(club.token, { ageMin: 20, ageMax: 18 }).expect(422);
    await exportCsv(club.token, { cursor: 'abc' }).expect(422);
    await exportCsv(club.token, { limit: 5 }).expect(422);
  });
});

describe('GET /players/export.csv — quota (D3, CP-33)', () => {
  it('palier gratuit : 3 par 24 heures pour l’organisation, partagé ; 429 avec palier et attente', async () => {
    const org = await organization('club');
    const first = await account('club', org);
    const second = await account('club', org);
    await exportCsv(first.token).expect(200);
    await exportCsv(second.token).expect(200);
    await exportCsv(first.token).expect(200);
    const refused = await exportCsv(second.token).expect(429);
    expect(refused.body).toMatchObject({
      code: 'EXPORT_QUOTA_EXCEEDED',
      details: [{ field: 'tier', code: 'free' }],
    });
    const wait = Number(refused.headers['retry-after']);
    expect(wait).toBeGreaterThan(86_000);
    expect(wait).toBeLessThanOrEqual(86_400);
    // Refus : rien d'inscrit ni d'audité.
    expect(await audit(second.userId, 'player.search.exported')).toHaveLength(1);
    const { rows } = await harness.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM search_exports WHERE organization_id = $1',
      [org],
    );
    expect(rows[0]?.n).toBe(3);
    // Une autre organisation garde son propre quota.
    const elsewhere = await account('club', await organization('club'));
    await exportCsv(elsewhere.token).expect(200);
  });

  it('lignes bornées par le palier, signalé au filigrane', async () => {
    const org = await organization('club');
    const club = await account('club', org);
    await harness.db.query(
      `INSERT INTO subscriptions (organization_id, tier, status, provider, period_start, period_end, quotas)
       VALUES ($1, 'mini', 'active', 'manual', now() - interval '1 day', now() + interval '30 days',
         '{"searchExportRows": 2}')`,
      [org],
    );
    for (const first of ['Abel', 'Basile', 'Cyril'])
      await player({ firstName: first, lastName: 'Borne' });
    const response = await exportCsv(club.token, { q: 'Borne' }).expect(200);
    const lines = csvLines(response.text).filter((line) => line !== '');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('2 lignes (limite du palier atteinte)');
    expect(lines[2]).toContain('Abel');
    expect(lines[3]).toContain('Basile');
  });

  it('abonnement courant : ses quotas relus en base à chaque export', async () => {
    const org = await organization('club');
    const club = await account('club', org);
    await harness.db.query(
      `INSERT INTO subscriptions (organization_id, tier, status, provider, period_start, period_end, quotas)
       VALUES ($1, 'essai', 'active', 'manual', now() - interval '1 day', now() + interval '30 days',
         '{"searchExportsPerDay": 1}')`,
      [org],
    );
    await exportCsv(club.token).expect(200);
    const refused = await exportCsv(club.token).expect(429);
    expect(refused.body).toMatchObject({ details: [{ field: 'tier', code: 'essai' }] });
    await harness.db.query(
      `UPDATE subscriptions SET quotas = '{"searchExportsPerDay": 5}' WHERE organization_id = $1`,
      [org],
    );
    await exportCsv(club.token).expect(200);
  });

  it('membre de plusieurs organisations : choix requis (422), hors des siennes (403)', async () => {
    const a = await organization('club');
    const b = await organization('federation');
    const reader = await account('club', a);
    await harness.db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'federation', $2)`,
      [reader.userId, b],
    );
    const ambiguous = await exportCsv(reader.token).expect(422);
    expect(ambiguous.body).toMatchObject({
      details: [{ field: 'quotaOrganizationId', code: 'required' }],
    });
    await exportCsv(reader.token, { quotaOrganizationId: await organization('club') }).expect(403);
    await exportCsv(reader.token, { quotaOrganizationId: b }).expect(200);
    const { rows } = await harness.db.query<{ organization_id: string }>(
      'SELECT organization_id::text FROM search_exports WHERE user_id = $1',
      [reader.userId],
    );
    expect(rows).toEqual([{ organization_id: b }]);
  });

  it('cumul de rôles : académie + club exporte au nom du club ; recruteur sans KYC 3 n’impute rien', async () => {
    const club = await organization('club');
    const academy = await organization('academy');
    const agency = await organization('agency');
    const reader = await account('club', club);
    await harness.db.query(
      `INSERT INTO user_roles (user_id, role, organization_id)
       VALUES ($1, 'academy', $2), ($1, 'recruiter', $3)`,
      [reader.userId, academy, agency],
    );
    // Ni choix requis (le recruteur sans KYC 3 ne compte pas), ni imputation à l'académie.
    await exportCsv(reader.token).expect(200);
    await exportCsv(reader.token, { quotaOrganizationId: agency }).expect(403);
    await exportCsv(reader.token, { quotaOrganizationId: academy }).expect(403);
    const { rows } = await harness.db.query<{ organization_id: string }>(
      'SELECT organization_id::text FROM search_exports WHERE user_id = $1',
      [reader.userId],
    );
    expect(rows).toEqual([{ organization_id: club }]);
  });

  it('administrateur : sans quota ni organisation', async () => {
    const admin = await account('admin');
    for (let i = 0; i < 5; i += 1) await exportCsv(admin.token).expect(200);
  });

  it('au-delà de la règle de débit : 429 `RATE_LIMITED`', async () => {
    const club = await account('club', await organization('club'));
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      player_search_export_account: { limit: 1, windowSeconds: 60 },
    });
    await exportCsv(club.token).expect(200);
    const refused = await exportCsv(club.token).expect(429);
    expect(refused.body).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('GET /players/export.csv — journal (D5, CP-14)', () => {
  it('club : export audité sans valeur de critère ; journal applicatif sans critère', async () => {
    const org = await organization('club');
    const club = await account('club', org);
    await player({ lastName: 'Tracable', city: 'Ebolowa' });
    const response = await exportCsv(club.token, { q: 'Tracable', city: 'Ebolowa' }).expect(200);
    const exportId = /export ([0-9a-f-]{36})/.exec(csvLines(response.text)[0] ?? '')?.[1];
    expect(await audit(club.userId, 'player.search.exported')).toEqual([
      {
        target_id: exportId,
        metadata: { sort: 'name', criteria: ['city', 'q'], rows: 1, organization_id: org },
      },
    ]);
    const logs = JSON.stringify(harness.logs.lines());
    expect(logs).not.toContain('Tracable');
    expect(logs).not.toContain('Ebolowa');
    expect(await audit(club.userId, 'player.profile.listed')).toEqual([]);
  });

  it('administrateur : chaque mineur exporté audité avec l’export, aucun majeur', async () => {
    const admin = await account('admin');
    const guardian = await account('guardian');
    const guardianId = await verifiedGuardian(guardian.userId);
    const minor = await player({ lastName: 'Exportmineur', birthDate: '2012-06-07', guardianId });
    await publish(minor.id, guardianId);
    await player({ lastName: 'Exportmineur' });
    const response = await exportCsv(admin.token, { q: 'Exportmineur' }).expect(200);
    const exportId = /export ([0-9a-f-]{36})/.exec(csvLines(response.text)[0] ?? '')?.[1];
    expect(await audit(admin.userId, 'player.profile.listed')).toEqual([
      { target_id: minor.id, metadata: { export_id: exportId } },
    ]);
  });
});
