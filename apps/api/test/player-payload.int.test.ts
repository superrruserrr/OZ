import { PLAYER_VIEWS, RBAC_ROLES, type PlayerViewName, type RbacRole } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { PLAYER_PHONE, playerFixtures, type Account } from './player-fixtures.js';

// Inspection de payload (lot 1.13a, EX-115 n° 6, CP-10, CP-11) sur la pile réelle : pour chacun des
// rôles et un compte sans rôle, les clés reçues de `GET /players/:ozId` sont exactement celles de la
// vue attendue, sur un majeur, un mineur rattaché à un club et un mineur publié non rattaché.

const ORIGIN = 'http://localhost:3000';

type Reader = RbacRole | 'none' | 'self';
type Target = 'adult' | 'attachedMinor' | 'publishedMinor';
/** Vue attendue, ou le statut d'un refus. */
type Expected = PlayerViewName | 403 | 404;

// Recruteur : aucun droit avant le KYC 3, que l'API ne connaît pas encore (lot 1.10b).
const EXPECTED: Readonly<Record<Reader, Readonly<Record<Target, Expected>>>> = {
  none: { adult: 403, attachedMinor: 403, publishedMinor: 403 },
  self: { adult: 'PlayerSelfView', attachedMinor: 404, publishedMinor: 404 },
  player: { adult: 'PlayerPublicView', attachedMinor: 404, publishedMinor: 404 },
  guardian: {
    adult: 'PlayerPublicView',
    attachedMinor: 'PlayerGuardianView',
    publishedMinor: 'PlayerGuardianView',
  },
  academy: { adult: 'PlayerPublicView', attachedMinor: 404, publishedMinor: 'PlayerPublicView' },
  club: {
    adult: 'PlayerPublicView',
    attachedMinor: 'PlayerOrganizationView',
    publishedMinor: 'PlayerPublicView',
  },
  federation: {
    adult: 'PlayerPublicView',
    attachedMinor: 404,
    publishedMinor: 'PlayerPublicView',
  },
  center: { adult: 'PlayerPublicView', attachedMinor: 404, publishedMinor: 404 },
  recruiter: { adult: 403, attachedMinor: 403, publishedMinor: 403 },
  admin: {
    adult: 'PlayerAdminView',
    attachedMinor: 'PlayerAdminView',
    publishedMinor: 'PlayerAdminView',
  },
};

const THIRD_PARTY_VIEWS: readonly PlayerViewName[] = ['PlayerPublicView'];
const FORBIDDEN_KEY = /encrypted|hmac|hash|secret|password|token|documentNumber/i;

let harness: AuthHarness;
let server: App;
const readers = new Map<Reader, Account>();
const targets = new Map<Target, string>();

beforeAll(async () => {
  harness = await startAuthHarness();
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
  server = harness.app.getHttpServer();
  const fixtures = await playerFixtures(harness, 'payload');
  const organizations = new Map<RbacRole, string>();
  for (const role of ['academy', 'club', 'federation', 'center', 'recruiter'] as const) {
    organizations.set(role, await fixtures.organization(role));
  }
  readers.set('none', await fixtures.account());
  readers.set('self', await fixtures.account('player'));
  for (const role of RBAC_ROLES) {
    readers.set(role, await fixtures.account(role, organizations.get(role) ?? null));
  }
  const guardianId = await fixtures.verifiedGuardian(readers.get('guardian')?.userId ?? '');

  targets.set(
    'adult',
    (await fixtures.player({ userId: readers.get('self')?.userId ?? null })).ozId,
  );
  const attached = await fixtures.player({
    birthDate: '2012-06-07',
    guardianId,
    organizationId: organizations.get('club') ?? null,
  });
  targets.set('attachedMinor', attached.ozId);
  const published = await fixtures.player({ birthDate: '2011-09-10', guardianId });
  await fixtures.publish(published.id, guardianId);
  targets.set('publishedMinor', published.ozId);
}, 240_000);
afterAll(async () => {
  await harness.stop();
});

const cases = (Object.keys(EXPECTED) as Reader[]).flatMap((reader) =>
  (Object.keys(EXPECTED[reader]) as Target[]).map((target) => ({
    reader,
    target,
    expected: EXPECTED[reader][target],
  })),
);

describe.each(cases)('$reader lit $target', ({ reader, target, expected }) => {
  it(typeof expected === 'number' ? `refus ${String(expected)}` : `vue ${expected}`, async () => {
    const response = await request(server)
      .get(`/players/${targets.get(target) ?? ''}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${readers.get(reader)?.token ?? ''}`);
    if (typeof expected === 'number') {
      expect(response.status).toBe(expected);
      expect(JSON.stringify(response.body)).not.toMatch(/Synthétique|Yaoundé|\+237/);
      return;
    }
    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    const keys = Object.keys(body);
    // Exactement la vue : données toutes présentes, aucune clé de plus (CP-10).
    expect(keys.sort()).toEqual([...PLAYER_VIEWS[expected].fields].sort());
    expect(keys.filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);
    expect(Object.values(body).some((value) => value === undefined)).toBe(false);
    if (THIRD_PARTY_VIEWS.includes(expected)) {
      expect(body).not.toHaveProperty('birthDate');
      expect(body).not.toHaveProperty('verificationStatus');
    }
    // Téléphone d'un mineur : son tuteur et l'administrateur seulement (CP-11).
    const minor = target !== 'adult';
    const mayHavePhone = minor ? reader === 'guardian' || reader === 'admin' : reader !== 'player';
    if ('phone' in body) {
      expect(mayHavePhone).toBe(true);
      expect(body.phone).toBe(PLAYER_PHONE);
    }
    if (minor && (reader === 'guardian' || reader === 'admin'))
      expect(body.phone).toBe(PLAYER_PHONE);
  });
});
