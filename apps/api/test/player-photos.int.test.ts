import { playerPhotosOutputSchema } from '@oz/contracts';
import { cleanKey, type DocumentStorage } from '@oz/storage';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { DOCUMENT_STORAGE } from '../src/document/document.tokens.js';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// Photos du joueur (lot 1.19cd, U1 et U2) : galerie selon la vue, six au plus, photo de profil,
// retrait, bloc `photos` masquable, lecture auditée.

const ORIGIN = 'http://localhost:3000';
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
let harness: AuthHarness;
let server: App;
let storage: DocumentStorage;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let player: PlayerFixtures['player'];

type Status = 'pending' | 'clean' | 'rejected';
async function photo(playerId: string, uploadedBy: string, status: Status = 'clean') {
  const { rows } = await harness.db.query<{ id: string }>(
    `WITH n AS (SELECT oz_uuid_v7() AS id)
     INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes,
       sha256, av_status, rejection_reason, width, height, retention_until)
     SELECT n.id, 'photo', $1, $2,
       CASE WHEN $3 = 'clean' THEN 'clean/' ELSE 'quarantine/' END || n.id, 'image/png', $4,
       repeat('a', 64), $3::av_status, CASE WHEN $3 = 'rejected' THEN 'dimensions' END, 1200, 900,
       now() + interval '90 days'
     FROM n RETURNING id::text`,
    [playerId, uploadedBy, status, PNG.length],
  );
  const id = rows[0]?.id ?? '';
  if (status === 'clean') await storage.put(cleanKey(id), PNG, 'image/png');
  return id;
}
const as = (token: string) => ({
  get: (path: string) =>
    request(server).get(path).set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`),
  put: (path: string, body: object) =>
    request(server)
      .put(path)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send(body),
  patch: (path: string, body: object) =>
    request(server)
      .patch(path)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send(body),
  del: (path: string) =>
    request(server).delete(path).set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object) =>
    request(server)
      .post(path)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send(body),
});
const ids = (body: unknown) => (body as { items: { id: string }[] }).items.map((item) => item.id);
const reads = async (documentId: string) =>
  (
    await harness.db.query(
      `SELECT 1 FROM audit_log WHERE target_id = $1 AND action = 'document.read.granted'`,
      [documentId],
    )
  ).rowCount;

beforeAll(async () => {
  harness = await startAuthHarness({ FEATURE_DOCUMENTS: 'true' });
  server = harness.app.getHttpServer();
  storage = harness.app.get<DocumentStorage>(DOCUMENT_STORAGE, { strict: false });
  ({ account, organization, player } = await playerFixtures(harness, 'photos'));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('galerie du titulaire', () => {
  it('toute la galerie, gérable ; URL d’une photo saine seulement, auditée', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const clean = await photo(target.id, owner.userId);
    const pending = await photo(target.id, owner.userId, 'pending');
    const list = await as(owner.token).get('/players/me/photos').expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body).toMatchObject({ limit: 6, manageable: true });
    // Contrat strict : aucune photo de profil choisie, chaque `isProfile` vaut false (jamais null).
    expect(playerPhotosOutputSchema.parse(list.body).items.every((item) => !item.isProfile)).toBe(
      true,
    );
    expect(ids(list.body).sort()).toEqual([clean, pending].sort());
    expect(JSON.stringify(list.body)).not.toContain('clean/');
    const url = await as(owner.token).get(`/players/me/photos/${clean}/url`).expect(200);
    expect(url.body).toHaveProperty('url');
    expect(await reads(clean)).toBe(1);
    await as(owner.token).get(`/players/me/photos/${pending}/url`).expect(404);
    await as(owner.token).get('/players/me/photos/pas-un-uuid/url').expect(404);
  });

  it('photo gardée tant que le joueur la garde : échéance repoussée par la base', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const id = await photo(target.id, owner.userId);
    const { rows } = await harness.db.query<{ far: boolean }>(
      `SELECT retention_until > now() + interval '50 years' AS far FROM documents WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.far).toBe(true);
  });

  it('photo de profil : saine seulement, retirée par null ; auditée', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const clean = await photo(target.id, owner.userId);
    const pending = await photo(target.id, owner.userId, 'pending');
    const set = await as(owner.token)
      .put('/players/me/profile-photo', { documentId: clean })
      .expect(200);
    expect((set.body as { items: { id: string; isProfile: boolean }[] }).items[0]).toMatchObject({
      id: clean,
      isProfile: true,
    });
    await as(owner.token).put('/players/me/profile-photo', { documentId: pending }).expect(404);
    await as(owner.token).put('/players/me/profile-photo', { documentId: null }).expect(200);
    const { rows } = await harness.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log
       WHERE target_id = $1 AND action = 'player.photo.profile_set'`,
      [target.id],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('retrait : 204, hors galerie, photo de profil rendue, échéance ramenée', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const id = await photo(target.id, owner.userId);
    await as(owner.token).put('/players/me/profile-photo', { documentId: id }).expect(200);
    await as(owner.token).del(`/players/me/photos/${id}`).expect(204);
    expect(ids((await as(owner.token).get('/players/me/photos').expect(200)).body)).toEqual([]);
    const { rows } = await harness.db.query<{ due: boolean; profile: string | null }>(
      `SELECT d.retention_until <= now() AS due, p.profile_photo_id::text AS profile
       FROM documents d JOIN players p ON p.id = d.player_id WHERE d.id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ due: true, profile: null });
    await as(owner.token).del(`/players/me/photos/${id}`).expect(404);
  });

  it('six au plus : le septième dépôt est refusé (409)', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    for (let index = 0; index < 6; index += 1) await photo(target.id, owner.userId);
    const refused = await as(owner.token)
      .post('/documents/upload', {
        documentType: 'photo',
        playerId: target.id,
        contentType: 'image/png',
        sizeBytes: PNG.length,
        sha256: 'b'.repeat(64),
      })
      .expect(409);
    expect((refused.body as ApiError).code).toBe('PHOTO_LIMIT_REACHED');
  });

  it('mineur : sa galerie se lit, ne se gère pas (son tuteur la gère)', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId, birthDate: '2013-06-01' });
    const id = await photo(target.id, owner.userId);
    const list = await as(owner.token).get('/players/me/photos').expect(200);
    expect(list.body).toMatchObject({ manageable: false });
    await as(owner.token).put('/players/me/profile-photo', { documentId: id }).expect(404);
    await as(owner.token).del(`/players/me/photos/${id}`).expect(404);
  });
});

describe('galerie vue d’un tiers', () => {
  it('club : photos saines seulement ; bloc masqué : aucune ; URL refusée', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const clean = await photo(target.id, owner.userId);
    await photo(target.id, owner.userId, 'rejected');
    const club = await account('club', await organization('club'));
    const list = await as(club.token).get(`/players/${target.ozId}/photos`).expect(200);
    expect(list.body).toMatchObject({ manageable: false });
    expect(ids(list.body)).toEqual([clean]);
    await as(club.token).get(`/players/${target.ozId}/photos/${clean}/url`).expect(200);

    await as(owner.token)
      .patch(`/players/${target.ozId}/visibility`, { photos: false })
      .expect(200);
    expect(
      ids((await as(club.token).get(`/players/${target.ozId}/photos`).expect(200)).body),
    ).toEqual([]);
    await as(club.token).get(`/players/${target.ozId}/photos/${clean}/url`).expect(404);
    // Le titulaire voit toujours sa galerie.
    expect(ids((await as(owner.token).get('/players/me/photos').expect(200)).body)).toContain(
      clean,
    );
  });

  it('tiers sans vue (mineur non publié) : 404 ; recruteur sans KYC 3 : 403', async () => {
    const owner = await account('player');
    const minor = await player({ userId: owner.userId, birthDate: '2013-06-01' });
    await photo(minor.id, owner.userId);
    const center = await account('center', await organization('center'));
    await as(center.token).get(`/players/${minor.ozId}/photos`).expect(404);
    const recruiter = await account('recruiter', await organization('agency'));
    await as(recruiter.token).get(`/players/${minor.ozId}/photos`).expect(403);
  });
});
