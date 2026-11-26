import type { Actor } from '@oz/auth';
import type { PrismaClient } from '@oz/db';
import type { DocumentStorage } from '@oz/storage';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { READ_URL_SECONDS } from './document-read.service.js';
import { PlayerPhotoService } from './player-photo.service.js';

// Photos du joueur (lot 1.19ce, U1 et U2) : vue du lecteur, 404 uniforme, gestion par le titulaire.
const db = vi.hoisted(() => ({
  playerPhotos: vi.fn(),
  playerProfileByOzId: vi.fn(),
  playerProfileOfUser: vi.fn(),
  recordDocumentRead: vi.fn(),
  removePlayerPhoto: vi.fn(),
  setPlayerProfilePhoto: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000009';
const PLAYER = '00000000-0000-4000-8000-000000000002';
const CLEAN = '00000000-0000-4000-8000-000000000003';
const PENDING = '00000000-0000-4000-8000-000000000004';
const OZ_ID = 'OZ-CM-26-7K4M9Q-M';
const checkedAt = new Date('2026-11-03T10:00:00Z');

const owner: Actor = {
  userId: USER,
  roles: [{ role: 'player', organizationId: null }],
  isKyc3Verified: false,
};
const club: Actor = {
  userId: OTHER,
  roles: [{ role: 'club', organizationId: '00000000-0000-4000-8000-0000000000c1' }],
  isKyc3Verified: false,
};

const profile = (access: Record<string, unknown> = {}, visibility = {}) => ({
  id: PLAYER,
  access: {
    userId: USER,
    birthDate: new Date('1995-03-04T00:00:00Z'),
    verificationStatus: 'verified',
    guardianUserId: null,
    organizationId: null,
    testedByOrganizationIds: [],
    hasPublicationConsent: false,
    deletionPending: false,
    checkedAt,
    ...access,
  },
  data: { ozId: OZ_ID },
  kycLevel: 2,
  visibility,
});
const photo = (id: string, status: string, isProfile = false) => ({
  id,
  status,
  isProfile,
  width: status === 'clean' ? 800 : null,
  height: status === 'clean' ? 600 : null,
  mimeType: 'image/webp',
  storageKey: `clean/${id}`,
});

const storage = { presignGet: vi.fn() };
const consume = vi.fn();
const logger = { info: vi.fn() };
const service = new PlayerPhotoService(
  {} as PrismaClient,
  storage as unknown as DocumentStorage,
  { consume } as unknown as RateLimiter,
  logger as unknown as PinoLogger,
);

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue({ allowed: true });
  db.playerProfileOfUser.mockResolvedValue(profile());
  db.playerProfileByOzId.mockResolvedValue(profile());
  db.playerPhotos.mockResolvedValue([photo(CLEAN, 'clean', true), photo(PENDING, 'pending')]);
  db.setPlayerProfilePhoto.mockResolvedValue(true);
  db.removePlayerPhoto.mockResolvedValue(true);
  storage.presignGet.mockResolvedValue({
    url: 'http://s3/clean/x',
    expiresAt: new Date('2026-11-03T10:05:00Z'),
  });
});

describe('PlayerPhotoService.list', () => {
  it('titulaire : toute la galerie, gérable', async () => {
    const out = await service.list(owner, null);
    expect(out).toMatchObject({ limit: 6, manageable: true });
    expect(out.items.map((item) => item.id)).toEqual([CLEAN, PENDING]);
    expect(out.items[0]).toEqual({
      id: CLEAN,
      status: 'clean',
      isProfile: true,
      width: 800,
      height: 600,
    });
  });

  it('tiers : photos saines seules, non gérable ; bloc masqué : aucune, rien n’est lu', async () => {
    const out = await service.list(club, OZ_ID);
    expect(out.manageable).toBe(false);
    expect(out.items.map((item) => item.id)).toEqual([CLEAN]);
    db.playerProfileByOzId.mockResolvedValue(profile({}, { photos: false }));
    db.playerPhotos.mockClear();
    expect((await service.list(club, OZ_ID)).items).toEqual([]);
    expect(db.playerPhotos).not.toHaveBeenCalled();
  });

  it('sans fiche : code de `GET /players/me` pour soi, 404 pour un tiers', async () => {
    db.playerProfileOfUser.mockResolvedValue(null);
    await expect(service.list(owner, null)).rejects.toMatchObject({
      code: 'PLAYER_PROFILE_NOT_FOUND',
    });
    db.playerProfileByOzId.mockResolvedValue(null);
    await expect(service.list(club, OZ_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('fiche hors de la vue du lecteur (mineur non publié) : 404', async () => {
    db.playerProfileByOzId.mockResolvedValue(profile({ birthDate: new Date('2014-01-01') }));
    await expect(service.list(club, OZ_ID)).rejects.toMatchObject({ status: 404 });
    expect(db.playerPhotos).not.toHaveBeenCalled();
  });

  it('limite atteinte : 429, rien n’est lu', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    await expect(service.list(owner, null)).rejects.toMatchObject({ retryAfterSeconds: 42 });
    expect(db.withUserContext).not.toHaveBeenCalled();
  });
});

describe('PlayerPhotoService.url', () => {
  it('photo saine visible : audit puis URL de 5 minutes', async () => {
    expect(await service.url(club, OZ_ID, CLEAN)).toEqual({
      url: 'http://s3/clean/x',
      expiresAt: '2026-11-03T10:05:00.000Z',
    });
    expect(db.recordDocumentRead).toHaveBeenCalledWith({}, OTHER, { id: CLEAN, type: 'photo' });
    expect(storage.presignGet).toHaveBeenCalledWith({
      key: `clean/${CLEAN}`,
      contentType: 'image/webp',
      expiresInSeconds: READ_URL_SECONDS,
    });
  });

  it('photo en analyse, inconnue ou fiche absente : 404 sans audit ni URL', async () => {
    await expect(service.url(owner, null, PENDING)).rejects.toMatchObject({ status: 404 });
    await expect(service.url(owner, null, '')).rejects.toMatchObject({ status: 404 });
    db.playerProfileOfUser.mockResolvedValue(null);
    await expect(service.url(owner, null, CLEAN)).rejects.toMatchObject({ status: 404 });
    expect(db.recordDocumentRead).not.toHaveBeenCalled();
    expect(storage.presignGet).not.toHaveBeenCalled();
  });
});

describe('PlayerPhotoService.setProfile', () => {
  it('photo saine ou retour aux initiales : la base décide, galerie relue', async () => {
    expect((await service.setProfile(owner, CLEAN)).manageable).toBe(true);
    expect(db.setPlayerProfilePhoto).toHaveBeenCalledWith({}, PLAYER, CLEAN);
    await service.setProfile(owner, null);
    expect(db.setPlayerProfilePhoto).toHaveBeenLastCalledWith({}, PLAYER, null);
  });

  it('photo non saine, sans fiche, non gérable ou refus de la base : 404', async () => {
    await expect(service.setProfile(owner, PENDING)).rejects.toMatchObject({ status: 404 });
    db.setPlayerProfilePhoto.mockResolvedValueOnce(false);
    await expect(service.setProfile(owner, CLEAN)).rejects.toMatchObject({ status: 404 });
    db.playerProfileOfUser.mockResolvedValueOnce(
      profile({ birthDate: new Date('2014-01-01'), guardianUserId: OTHER }),
    );
    await expect(service.setProfile(owner, CLEAN)).rejects.toMatchObject({ status: 404 });
    db.playerProfileOfUser.mockResolvedValueOnce(null);
    await expect(service.setProfile(owner, null)).rejects.toMatchObject({ status: 404 });
    expect(db.setPlayerProfilePhoto).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerPhotoService.remove', () => {
  it('photo de sa galerie : retrait logique', async () => {
    await service.remove(owner, PENDING);
    expect(db.removePlayerPhoto).toHaveBeenCalledWith({}, PLAYER, PENDING);
  });

  it('photo inconnue, sans fiche, non gérable ou refus de la base : 404', async () => {
    await expect(service.remove(owner, OTHER)).rejects.toMatchObject({ status: 404 });
    db.removePlayerPhoto.mockResolvedValueOnce(false);
    await expect(service.remove(owner, CLEAN)).rejects.toMatchObject({ status: 404 });
    db.playerProfileOfUser.mockResolvedValueOnce(
      profile({ birthDate: new Date('2014-01-01'), guardianUserId: OTHER }),
    );
    await expect(service.remove(owner, CLEAN)).rejects.toMatchObject({ status: 404 });
    db.playerProfileOfUser.mockResolvedValueOnce(null);
    await expect(service.remove(owner, CLEAN)).rejects.toMatchObject({ status: 404 });
    expect(db.removePlayerPhoto).toHaveBeenCalledTimes(1);
  });
});
