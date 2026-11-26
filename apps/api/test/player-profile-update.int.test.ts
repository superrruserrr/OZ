import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// Modification de sa fiche (lot 1.19cb, `PATCH /players/me`) : CASL champ par champ, mineur refusé,
// identité figée hors `declared` (U3), audit sans valeur.

const ORIGIN = 'http://localhost:3000';
let harness: AuthHarness;
let server: App;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let player: PlayerFixtures['player'];

const patch = (token: string, body: unknown) =>
  request(server)
    .patch('/players/me')
    .set('Origin', ORIGIN)
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
const code = (response: { body: unknown }) => (response.body as Partial<ApiError>).code;
const updates = async (playerId: string) =>
  (
    await harness.db.query<{ actor_user_id: string; metadata: unknown }>(
      `SELECT actor_user_id::text, metadata FROM audit_log
       WHERE target_id = $1 AND action = 'player.profile.updated' ORDER BY chain_position`,
      [playerId],
    )
  ).rows;
const row = async (playerId: string) =>
  (
    await harness.db.query<Record<string, unknown>>(
      `SELECT first_name, city, height_cm, primary_position, updated_by::text
       FROM players WHERE id = $1`,
      [playerId],
    )
  ).rows[0];

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  ({ account, organization, player } = await playerFixtures(harness, 'edition'));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('PATCH /players/me', () => {
  it('majeur déclaré : champs modifiés, null efface, fiche relue, audit des noms seuls', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId, status: 'declared' });
    const response = await patch(owner.token, {
      firstName: 'Abena',
      city: 'Douala',
      heightCm: null,
      primaryPosition: 'winger',
    }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      ozId: target.ozId,
      firstName: 'Abena',
      city: 'Douala',
      heightCm: null,
      primaryPosition: 'winger',
      visibility: {},
    });
    expect(await row(target.id)).toMatchObject({
      first_name: 'Abena',
      city: 'Douala',
      height_cm: null,
      primary_position: 'winger',
      updated_by: owner.userId,
    });
    const audit = await updates(target.id);
    expect(audit).toEqual([
      {
        actor_user_id: owner.userId,
        metadata: { fields: ['firstName', 'city', 'primaryPosition', 'heightCm'] },
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain('Douala');
  });

  it('identité vérifiée : prénom refusé (409) ; même valeur ou autre champ permis', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId, status: 'verified' });
    const locked = await patch(owner.token, { lastName: 'Autre', city: 'Kribi' }).expect(409);
    expect(locked.body).toMatchObject({
      code: 'PROFILE_IDENTITY_LOCKED',
      details: [{ field: 'lastName', code: 'identity_locked' }],
    });
    expect((await row(target.id))?.city).toBe('Yaoundé');
    // Prénom inchangé : rien n'est réécrit, la ville passe.
    await patch(owner.token, { firstName: 'Joueur', city: 'Kribi' }).expect(200);
    expect(await updates(target.id)).toEqual([
      { actor_user_id: owner.userId, metadata: { fields: ['city'] } },
    ]);
  });

  it('aucun changement réel : 200, aucun audit', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    await patch(owner.token, { city: 'Yaoundé' }).expect(200);
    expect(await updates(target.id)).toEqual([]);
  });

  it('mineur sur sa propre fiche : 403, rien d’écrit', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId, birthDate: '2013-06-01' });
    const response = await patch(owner.token, { city: 'Douala' }).expect(403);
    expect(code(response)).toBe('PROFILE_UPDATE_FORBIDDEN');
    expect((await row(target.id))?.city).toBe('Yaoundé');
  });

  it('liste blanche : pays, date de naissance, statut, corps vide refusés (422)', async () => {
    const owner = await account('player');
    await player({ userId: owner.userId });
    for (const body of [
      { country: 'GH' },
      { birthDate: '2000-01-01' },
      { verificationStatus: 'verified' },
      {},
    ]) {
      expect((await patch(owner.token, body).expect(422)).status, JSON.stringify(body)).toBe(422);
    }
  });

  it('sans fiche (club) : 404 ; recruteur sans droit : 403', async () => {
    const club = await account('club', await organization('club'));
    expect(code(await patch(club.token, { city: 'Douala' }).expect(404))).toBe(
      'PLAYER_PROFILE_NOT_FOUND',
    );
    const recruiter = await account('recruiter', await organization('agency'));
    await patch(recruiter.token, { city: 'Douala' }).expect(403);
  });
});
