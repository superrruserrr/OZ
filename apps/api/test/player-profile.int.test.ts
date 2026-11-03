import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { PLAYER_PHONE, playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// Fiche joueur (lot 1.13a, EX-115 n° 1 à 3) sur la pile réelle : vue du rôle (EX-104), 404 uniforme,
// lecture journalisée de l'administrateur (EX-T16 n° 4), réglage de visibilité appliqué aux tiers.

const ORIGIN = 'http://localhost:3000';
const PHONE = PLAYER_PHONE;

let harness: AuthHarness;
let server: App;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let verifiedGuardian: PlayerFixtures['verifiedGuardian'];
let player: PlayerFixtures['player'];

const read = (token: string | undefined, ozId: string) => {
  const pending = request(server).get(`/players/${ozId}`).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

const setVisibility = (token: string, ozId: string, body: unknown) =>
  request(server)
    .patch(`/players/${ozId}/visibility`)
    .set('Origin', ORIGIN)
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);

const viewsOf = async (playerId: string) =>
  (
    await harness.db.query<{ actor_user_id: string; metadata: unknown }>(
      `SELECT actor_user_id::text, metadata FROM audit_log
       WHERE target_id = $1 AND action = 'player.profile.viewed' ORDER BY chain_position`,
      [playerId],
    )
  ).rows;

const errorCode = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  ({ account, organization, verifiedGuardian, player } = await playerFixtures(harness, 'fiche'));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('GET /players/:ozId', () => {
  it('titulaire majeur : vue complète, téléphone déchiffré, badge, sans cache ni audit', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const response = await read(owner.token, target.ozId).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      id: target.id,
      ozId: target.ozId,
      firstName: 'Joueur',
      lastName: 'Synthétique',
      birthDate: '1995-03-04',
      nationality: 'CM',
      country: 'CM',
      region: 'Centre',
      city: 'Yaoundé',
      primaryPosition: 'striker',
      secondaryPosition: null,
      dominantFoot: 'right',
      heightCm: 180,
      weightKg: 75,
      verificationStatus: 'verified',
      verificationLevel: 2,
      organizationId: null,
      phone: PHONE,
    });
    expect(await viewsOf(target.id)).toEqual([]);
  });

  it('tiers (club) : vue publique, année seule, badge, ni téléphone ni statut détaillé', async () => {
    const club = await account('club', await organization('club'));
    const target = await player();
    const body = (await read(club.token, target.ozId).expect(200)).body as Record<string, unknown>;
    expect(body).toMatchObject({ ozId: target.ozId, birthYear: 1995, verificationLevel: 2 });
    for (const key of ['birthDate', 'phone', 'verificationStatus', 'organizationId']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(await viewsOf(target.id)).toEqual([]);
  });

  it('mineur titulaire : sa fiche sans son téléphone (CP-11)', async () => {
    const minor = await account('player');
    const own = await player({ userId: minor.userId, birthDate: '2012-06-07' });
    const body = (await read(minor.token, own.ozId).expect(200)).body as Record<string, unknown>;
    expect(body).toMatchObject({ birthDate: '2012-06-07', verificationLevel: 2 });
    expect(body).not.toHaveProperty('phone');
  });

  it('OZ ID encodé dans le chemin : servi, jamais journalisé', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    await read(owner.token, target.ozId.replace('-', '%2D')).expect(200);
    expect(JSON.stringify(harness.logs.lines())).not.toContain(target.ozId.slice(3));
  });

  it('administrateur : vue complète, lecture journalisée au nom de l’acteur', async () => {
    const admin = await account('admin');
    const target = await player();
    expect((await read(admin.token, target.ozId).expect(200)).body).toMatchObject({
      phone: PHONE,
    });
    expect(await viewsOf(target.id)).toEqual([
      { actor_user_id: admin.userId, metadata: { view: 'PlayerAdminView' } },
    ]);
  });

  it('tuteur vérifié : vue de tuteur de l’enfant, téléphone compris', async () => {
    const guardian = await account('guardian');
    const child = await player({
      userId: null,
      birthDate: '2012-06-07',
      status: 'declared',
      guardianId: await verifiedGuardian(guardian.userId),
    });
    expect((await read(guardian.token, child.ozId).expect(200)).body).toMatchObject({
      birthDate: '2012-06-07',
      phone: PHONE,
      verificationLevel: 0,
    });
  });

  it('404 uniforme : inconnu, mal formé, supprimé, majeur non vérifié, mineur non publié', async () => {
    const club = await account('club', await organization('club'));
    const unverified = await player({ status: 'declared' });
    const minor = await player({ birthDate: '2012-06-07' });
    const deleted = await player();
    await harness.db.query('UPDATE players SET deleted_at = now() WHERE id = $1', [deleted.id]);
    const bodies = [];
    for (const ozId of [
      'OZ-CM-26-000000-0',
      'pas-un-oz-id',
      deleted.ozId,
      unverified.ozId,
      minor.ozId,
    ]) {
      const response = await read(club.token, ozId).expect(404);
      bodies.push({ code: errorCode(response), message: (response.body as ApiError).message });
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]?.code).toBe('NOT_FOUND');
  });

  it('sans session : 401 ; sans rôle, recruteur sans KYC 3 : 403', async () => {
    const target = await player();
    await read(undefined, target.ozId).expect(401);
    const nobody = await account();
    expect(errorCode(await read(nobody.token, target.ozId).expect(403))).toBe('AUTHZ_FORBIDDEN');
    const recruiter = await account('recruiter', await organization('recruiter'));
    expect(errorCode(await read(recruiter.token, target.ozId).expect(403))).toBe('AUTHZ_FORBIDDEN');
  });

  it('au-delà de la limite par compte : 429 avec Retry-After', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      player_profile_read_account: { limit: 2, windowSeconds: 3600 },
    });
    const club = await account('club', await organization('club'));
    const target = await player();
    await read(club.token, target.ozId).expect(200);
    await read(club.token, target.ozId).expect(200);
    const refused = await read(club.token, target.ozId).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('journal applicatif sans OZ ID ni donnée de la fiche', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    await read(owner.token, target.ozId).expect(200);
    await read(owner.token, 'OZ-CM-26-000000-0').expect(404);
    const logged = JSON.stringify(harness.logs.lines());
    for (const secret of [target.ozId, 'OZ-CM-26-000000-0', 'Yaoundé', PHONE]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe('PATCH /players/:ozId/visibility', () => {
  it('titulaire majeur : blocs fusionnés, appliqués à la lecture suivante d’un tiers seulement', async () => {
    const owner = await account('player');
    const club = await account('club', await organization('club'));
    const target = await player({ userId: owner.userId });
    const first = await setVisibility(owner.token, target.ozId, { location: false }).expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toEqual({ location: false });
    expect(
      (await setVisibility(owner.token, target.ozId, { sport: false }).expect(200)).body,
    ).toEqual({ location: false, sport: false });

    const seen = (await read(club.token, target.ozId).expect(200)).body as Record<string, unknown>;
    for (const key of ['region', 'city', 'primaryPosition', 'secondaryPosition', 'dominantFoot']) {
      expect(seen).not.toHaveProperty(key);
    }
    expect(seen).toMatchObject({ heightCm: 180, verificationLevel: 2 });
    expect((await read(owner.token, target.ozId).expect(200)).body).toMatchObject({
      city: 'Yaoundé',
      primaryPosition: 'striker',
    });
    const { rows } = await harness.db.query(
      `SELECT count(*)::int AS n FROM audit_log
       WHERE target_id = $1 AND action = 'player.visibility.updated'`,
      [target.id],
    );
    expect(rows[0]).toEqual({ n: 2 });
  });

  it('tuteur vérifié d’un mineur : permis', async () => {
    const guardian = await account('guardian');
    const child = await player({
      userId: null,
      birthDate: '2012-06-07',
      guardianId: await verifiedGuardian(guardian.userId),
    });
    expect(
      (await setVisibility(guardian.token, child.ozId, { physical: false }).expect(200)).body,
    ).toEqual({ physical: false });
  });

  it('mineur titulaire, autre joueur, inconnu : 404 ; rôles sans droit : 403', async () => {
    const minor = await account('player');
    const own = await player({ userId: minor.userId, birthDate: '2012-06-07' });
    await setVisibility(minor.token, own.ozId, { sport: false }).expect(404);
    const other = await account('player');
    const adult = await player();
    await setVisibility(other.token, adult.ozId, { sport: false }).expect(404);
    await setVisibility(other.token, 'OZ-CM-26-000000-0', { sport: false }).expect(404);
    const admin = await account('admin');
    expect(
      errorCode(await setVisibility(admin.token, adult.ozId, { sport: false }).expect(403)),
    ).toBe('AUTHZ_FORBIDDEN');
    const club = await account('club', await organization('club'));
    await setVisibility(club.token, adult.ozId, { sport: false }).expect(403);
    const { rows } = await harness.db.query(
      `SELECT visibility FROM players WHERE id = ANY($1::uuid[])`,
      [[own.id, adult.id]],
    );
    expect(rows).toEqual([{ visibility: {} }, { visibility: {} }]);
  });

  it('422 : corps vide, bloc inconnu, valeur non booléenne', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    for (const body of [{}, { phone: false }, { sport: 'non' }]) {
      const response = await setVisibility(owner.token, target.ozId, body).expect(422);
      expect(errorCode(response)).toBe('VALIDATION_FAILED');
    }
  });

  it('au-delà de la limite par compte : 429 avec Retry-After', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      player_visibility_update_account: { limit: 1, windowSeconds: 3600 },
    });
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    await setVisibility(owner.token, target.ozId, { sport: false }).expect(200);
    const refused = await setVisibility(owner.token, target.ozId, { sport: true }).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });
});
