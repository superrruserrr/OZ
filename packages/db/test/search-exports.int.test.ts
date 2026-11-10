import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  type SavedSearchDraft,
} from '../src/saved-searches.js';
import { currentSubscription, recordSearchExport } from '../src/search-exports.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Recherches sauvegardées et exports (lot 1.14b, tâches 2 et 3) sous le rôle `oz_app` et la RLS :
// privées au titulaire, 20 au plus (D2) ; quota par organisation sous verrou, inscrit et audité (D3,
// D5) ; effacées avec le compte.

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
const ids: Record<string, string> = {};
const id = (name: string): string => ids[name] ?? '';

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};
const as = <T>(user: string, fn: Parameters<typeof withUserContext<T>>[2]) =>
  withUserContext(client, id(user), fn);
const draft = (name: string, extra: Partial<SavedSearchDraft> = {}): SavedSearchDraft => ({
  name,
  criteria: { country: 'CM' },
  sort: 'name',
  ...extra,
});
const exportOf = (organizationId: string | null, rows = 12) => ({
  organizationId,
  rows,
  sort: 'name',
  criteria: ['ageMax', 'country'],
});

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());
  const user = async (name: string) => {
    ids[name] = (
      await one<{ id: string }>(
        `INSERT INTO users (email, email_verified_at, status) VALUES ($1, now(), 'active') RETURNING id`,
        [`${name}@example.test`],
      )
    ).id;
  };
  const org = async (name: string, type: string, status = 'verified') => {
    ids[name] = (
      await one<{ id: string }>(
        `INSERT INTO organizations (type, name, country, verification_status)
         VALUES ($1::organization_type, $2, 'CM', $3::verification_status) RETURNING id`,
        [type, `Organisation ${name}`, status],
      )
    ).id;
  };
  for (const name of ['owner', 'other', 'club', 'clubmate', 'academy', 'admin', 'pending']) {
    await user(name);
  }
  await org('clubOrg', 'club');
  await org('academyOrg', 'academy');
  await org('pendingOrg', 'club', 'pending');
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES
       ($1, 'club', $2), ($3, 'club', $2), ($4, 'academy', $5), ($6, 'admin', NULL),
       ($7, 'club', $8)`,
    [
      id('club'),
      id('clubOrg'),
      id('clubmate'),
      id('academy'),
      id('academyOrg'),
      id('admin'),
      id('pending'),
      id('pendingOrg'),
    ],
  );
}, 240_000);

afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

describe('recherches sauvegardées', () => {
  it('créées et listées par le titulaire seul, critères et tri rendus tels quels', async () => {
    const created = await as('owner', (tx) =>
      createSavedSearch(tx, draft('U17', { sort: 'birthYear', direction: 'desc' })),
    );
    if (created.outcome !== 'created') throw new Error(created.outcome);
    ids.saved = created.id;
    const mine = await as('owner', (tx) => listSavedSearches(tx));
    expect(mine).toEqual([
      {
        id: created.id,
        name: 'U17',
        criteria: { country: 'CM' },
        sort: 'birthYear',
        direction: 'desc',
        createdAt: created.createdAt,
      },
    ]);
    expect(await as('other', (tx) => listSavedSearches(tx))).toEqual([]);
  });

  it('un autre compte ne lit ni ne supprime la sauvegarde, même directement (RLS)', async () => {
    expect(await as('other', (tx) => deleteSavedSearch(tx, id('saved')))).toBe(false);
    const seen = await app.as(id('other'), (c) =>
      c.query('SELECT id FROM saved_searches WHERE id = $1', [id('saved')]),
    );
    expect(seen.rows).toEqual([]);
    const removed = await app.as(id('other'), (c) =>
      c.query('DELETE FROM saved_searches WHERE id = $1', [id('saved')]),
    );
    expect(removed.rowCount).toBe(0);
  });

  it('aucune écriture directe : ni insertion ni modification, même par le titulaire', async () => {
    await expect(
      app.as(id('owner'), (c) =>
        c.query(`INSERT INTO saved_searches (user_id, name, sort) VALUES ($1, 'x', 'name')`, [
          id('owner'),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await app.as(id('owner'), (c) =>
      c.query(`UPDATE saved_searches SET name = 'y' WHERE id = $1`, [id('saved')]),
    );
    expect(updated.rowCount).toBe(0);
  });

  it('20 au plus par compte, même en création simultanée ; suppression libère une place', async () => {
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        as('other', (tx) => createSavedSearch(tx, draft(`Recherche ${String(i)}`))),
      ),
    );
    expect(await as('other', (tx) => listSavedSearches(tx))).toHaveLength(20);
    expect(await as('other', (tx) => createSavedSearch(tx, draft('21e')))).toEqual({
      outcome: 'limit',
    });
    const [first] = await as('other', (tx) => listSavedSearches(tx));
    expect(await as('other', (tx) => deleteSavedSearch(tx, first?.id ?? ''))).toBe(true);
    expect((await as('other', (tx) => createSavedSearch(tx, draft('21e')))).outcome).toBe(
      'created',
    );
  });

  it('formes refusées par la base : nom vide ou trop long, tri inconnu, critères non objet', async () => {
    for (const bad of [
      draft(''),
      draft('x'.repeat(61)),
      draft('ok', { sort: 'heightCm' }),
      draft('ok', { criteria: ['x'] as unknown as Record<string, unknown> }),
    ]) {
      await expect(as('owner', (tx) => createSavedSearch(tx, bad))).rejects.toThrow();
    }
  });

  it('sans contexte utilisateur : refusé', async () => {
    await expect(
      app.as(null, (c) => c.query(`SELECT oz_saved_search_create('x', '{}', 'name', NULL)`)),
    ).rejects.toThrow(/compte requis/);
  });
});

describe('exports de recherche', () => {
  it('accepté pour un membre vérifié, inscrit sans valeur de critère et audité', async () => {
    const outcome = await as('club', (tx) => recordSearchExport(tx, exportOf(id('clubOrg'))));
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    const row = await one<Record<string, unknown>>(
      `SELECT user_id::text, organization_id::text, row_count, sort, criteria_keys
       FROM search_exports WHERE id = $1`,
      [outcome.id],
    );
    expect(row).toEqual({
      user_id: id('club'),
      organization_id: id('clubOrg'),
      row_count: 12,
      sort: 'name',
      criteria_keys: ['ageMax', 'country'],
    });
    const audit = await one<{ actor: string; target: string; metadata: unknown }>(
      `SELECT actor_user_id::text AS actor, target_id::text AS target, metadata
       FROM audit_log WHERE action = 'player.search.exported'`,
    );
    expect(audit).toEqual({
      actor: id('club'),
      target: outcome.id,
      metadata: {
        sort: 'name',
        criteria: ['ageMax', 'country'],
        rows: 12,
        organization_id: id('clubOrg'),
      },
    });
  });

  it('quota par organisation sur 24 heures glissantes, partagé entre ses membres, sous verrou', async () => {
    // 1 export déjà inscrit ; 6 demandes simultanées de deux membres pour 3 places au total.
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        as(i % 2 === 0 ? 'club' : 'clubmate', (tx) =>
          recordSearchExport(tx, exportOf(id('clubOrg'))),
        ),
      ),
    );
    expect(outcomes.filter((o) => o.outcome === 'accepted')).toHaveLength(2);
    const refused = outcomes.find((o) => o.outcome === 'quota_exceeded');
    if (refused?.outcome !== 'quota_exceeded') throw new Error('aucun refus');
    const oldest = await one<{ at: Date }>(
      `SELECT min(created_at) + interval '24 hours' AS at FROM search_exports WHERE organization_id = $1`,
      [id('clubOrg')],
    );
    expect(refused.resetAt).toEqual(oldest.at);
    const count = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM search_exports WHERE organization_id = $1`,
      [id('clubOrg')],
    );
    expect(count.n).toBe(3);
    const audits = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'player.search.exported'`,
    );
    expect(audits.n).toBe(3);
  });

  it('une place se libère 24 heures après le plus ancien export', async () => {
    await db.query(
      `UPDATE search_exports SET created_at = now() - interval '25 hours'
       WHERE id = (SELECT id FROM search_exports WHERE organization_id = $1 ORDER BY created_at LIMIT 1)`,
      [id('clubOrg')],
    );
    expect(
      (await as('clubmate', (tx) => recordSearchExport(tx, exportOf(id('clubOrg'))))).outcome,
    ).toBe('accepted');
  });

  it('refusé hors des organisations vérifiées du lecteur, pour une académie, sans organisation', async () => {
    for (const [user, organization] of [
      ['other', id('clubOrg')],
      ['academy', id('academyOrg')],
      ['pending', id('pendingOrg')],
      ['club', id('academyOrg')],
      ['club', null],
    ] as const) {
      await expect(
        as(user, (tx) => recordSearchExport(tx, exportOf(organization))),
        `${user} → ${String(organization)}`,
      ).rejects.toThrow(/organisation/);
    }
    // Lignes : 200 au plus au palier gratuit, 1 000 pour l'administrateur ; jamais reçues du palier.
    await expect(
      as('club', (tx) => recordSearchExport(tx, exportOf(id('clubOrg'), 201))),
    ).rejects.toThrow(/au-delà du palier/);
    await expect(as('admin', (tx) => recordSearchExport(tx, exportOf(null, 1001)))).rejects.toThrow(
      /au-delà du plafond/,
    );
  });

  it('administrateur : sans organisation ni quota', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await as('admin', (tx) => recordSearchExport(tx, exportOf(null, 1000)))).outcome,
      ).toBe('accepted');
    }
  });

  it('lecture : le demandeur seul ; aucune écriture directe', async () => {
    const mine = await app.as(id('club'), (c) => c.query('SELECT user_id FROM search_exports'));
    expect(mine.rows.every((r: { user_id: string }) => r.user_id === id('club'))).toBe(true);
    expect(mine.rows.length).toBeGreaterThan(0);
    await expect(
      app.as(id('club'), (c) =>
        c.query(`INSERT INTO search_exports (user_id, row_count, sort) VALUES ($1, 0, 'name')`, [
          id('club'),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('abonnement courant relu sous la RLS des membres ; absent : palier gratuit', async () => {
    expect(await as('club', (tx) => currentSubscription(tx, id('clubOrg')))).toBeNull();
    await db.query(
      `INSERT INTO subscriptions (organization_id, tier, status, provider, period_start, period_end, quotas)
       VALUES ($1, 'pro', 'active', 'manual', now() - interval '1 day', now() + interval '30 days',
         '{"searchExportsPerDay": 50}')`,
      [id('clubOrg')],
    );
    expect(await as('club', (tx) => currentSubscription(tx, id('clubOrg')))).toEqual({
      tier: 'pro',
      quotas: { searchExportsPerDay: 50 },
    });
    expect(await as('other', (tx) => currentSubscription(tx, id('clubOrg')))).toBeNull();
  });

  it('quota relu en base : palier de l’abonnement, valeur hors bornes ignorée', async () => {
    const quota = async () =>
      one<{ tier: string; per_day: number; max_rows: number }>(
        'SELECT * FROM oz_search_export_quota($1)',
        [id('clubOrg')],
      );
    expect(await quota()).toEqual({ tier: 'pro', per_day: 50, max_rows: 200 });
    await db.query(
      `UPDATE subscriptions SET quotas = '{"searchExportsPerDay": 2.5, "searchExportRows": 800}'
       WHERE organization_id = $1`,
      [id('clubOrg')],
    );
    expect(await quota()).toEqual({ tier: 'pro', per_day: 3, max_rows: 800 });
    await db.query(
      `UPDATE subscriptions SET quotas = '{"searchExportsPerDay": "9", "searchExportRows": 5000}'
       WHERE organization_id = $1`,
      [id('clubOrg')],
    );
    expect(await quota()).toEqual({ tier: 'pro', per_day: 3, max_rows: 200 });
    await expect(
      app.as(id('club'), (c) =>
        c.query('SELECT * FROM oz_search_export_quota($1)', [id('clubOrg')]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('palier abaissé sous l’usage : la remise à zéro attend assez de sorties de fenêtre', async () => {
    const used = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM search_exports
       WHERE organization_id = $1 AND created_at > now() - interval '24 hours'`,
      [id('clubOrg')],
    );
    expect(used.n).toBe(3);
    await db.query(
      `UPDATE subscriptions SET tier = 'reduit', quotas = '{"searchExportsPerDay": 1}'
       WHERE organization_id = $1`,
      [id('clubOrg')],
    );
    const refused = await as('club', (tx) => recordSearchExport(tx, exportOf(id('clubOrg'))));
    if (refused.outcome !== 'quota_exceeded') throw new Error(refused.outcome);
    expect(refused.tier).toBe('reduit');
    // 3 exports pour 1 place : le 3e plus ancien doit sortir, pas le premier.
    const third = await one<{ at: Date }>(
      `SELECT created_at + interval '24 hours' AS at FROM search_exports
       WHERE organization_id = $1 AND created_at > now() - interval '24 hours'
       ORDER BY created_at OFFSET 2 LIMIT 1`,
      [id('clubOrg')],
    );
    expect(refused.resetAt).toEqual(third.at);
    await db.query(
      `UPDATE subscriptions SET quotas = '{"searchExportsPerDay": 0}' WHERE organization_id = $1`,
      [id('clubOrg')],
    );
    const closed = await as('club', (tx) => recordSearchExport(tx, exportOf(id('clubOrg'))));
    if (closed.outcome !== 'quota_exceeded') throw new Error(closed.outcome);
    expect(closed.resetAt.getTime() - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
  });
});

describe('effacement du compte', () => {
  it('compte clos : ses sauvegardes disparaissent, ses exports restent', async () => {
    await as('club', (tx) => createSavedSearch(tx, draft('Marqueur effacé')));
    await db.query(`UPDATE users SET deleted_at = now(), status = 'closed' WHERE id = $1`, [
      id('club'),
    ]);
    const left = await one<{ saved: number; exports: number }>(
      `SELECT (SELECT count(*)::int FROM saved_searches WHERE user_id = $1) AS saved,
              (SELECT count(*)::int FROM search_exports WHERE user_id = $1) AS exports`,
      [id('club')],
    );
    expect(left.saved).toBe(0);
    expect(left.exports).toBeGreaterThan(0);
  });
});
