import type { Actor } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type { PrismaClient } from '@oz/db';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { PlayerProfileService } from './player-profile.service.js';

// Fiche (lot 1.13a) : vue du rôle, 404 uniforme, audit des lectures journalisées, limites.
const db = vi.hoisted(() => ({
  playerProfileByOzId: vi.fn(),
  playerPhone: vi.fn(),
  recordPlayerProfileView: vi.fn(),
  setPlayerVisibility: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const PLAYER = '00000000-0000-4000-8000-000000000002';
const OZ_ID = 'OZ-CM-26-7K4M9Q-M';
const checkedAt = new Date('2026-11-03T10:00:00Z');

const actor = (role: Actor['roles'][number]['role'], userId = USER): Actor => ({
  userId,
  roles: [
    { role, organizationId: role === 'club' ? '00000000-0000-4000-8000-0000000000c1' : null },
  ],
  isKyc3Verified: false,
});

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
  data: {
    ozId: OZ_ID,
    firstName: 'Joueur',
    lastName: 'Synthétique',
    nationality: 'CM',
    country: 'CM',
    region: 'Centre',
    city: 'Yaoundé',
    primaryPosition: 'striker',
    secondaryPosition: null,
    dominantFoot: 'right',
    heightCm: 180,
    weightKg: 75,
  },
  kycLevel: 2,
  visibility,
});

const consume = vi.fn();
const logger = { info: vi.fn() };
const config = { auth: { columnEncryptionKey: 'k'.repeat(40) } } as unknown as ApiConfig;
const service = new PlayerProfileService(
  {} as PrismaClient,
  config,
  { consume } as unknown as RateLimiter,
  logger as unknown as PinoLogger,
);

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue({ allowed: true });
  db.playerProfileByOzId.mockResolvedValue(profile());
  db.playerPhone.mockResolvedValue('+237690000001');
});

describe('PlayerProfileService.read', () => {
  it('titulaire : vue complète avec téléphone et badge, sans audit', async () => {
    const body = await service.read(actor('player'), OZ_ID);
    expect(body).toMatchObject({
      id: PLAYER,
      ozId: OZ_ID,
      birthDate: '1995-03-04',
      verificationLevel: 2,
      verificationStatus: 'verified',
      phone: '+237690000001',
    });
    expect(body).not.toHaveProperty('birthYear');
    expect(db.playerPhone).toHaveBeenCalledWith({}, PLAYER, 'k'.repeat(40));
    expect(db.recordPlayerProfileView).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith('player_profile_read_account', USER);
  });

  it('tiers : vue publique, année seule, ni téléphone déchiffré ni statut détaillé', async () => {
    const body = await service.read(actor('club', 'un-autre'), OZ_ID);
    expect(body).toMatchObject({ birthYear: 1995, verificationLevel: 2, city: 'Yaoundé' });
    for (const key of ['birthDate', 'phone', 'verificationStatus', 'organizationId']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(db.playerPhone).not.toHaveBeenCalled();
  });

  it('tiers : blocs masqués absents, jamais `null`', async () => {
    db.playerProfileByOzId.mockResolvedValue(profile({}, { location: false, sport: false }));
    const body = await service.read(actor('club', 'un-autre'), OZ_ID);
    for (const key of ['region', 'city', 'primaryPosition', 'secondaryPosition', 'dominantFoot']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body).toMatchObject({ heightCm: 180 });
    // Le titulaire voit tout.
    expect(await service.read(actor('player'), OZ_ID)).toMatchObject({ city: 'Yaoundé' });
  });

  it('administrateur : lecture journalisée dans la transaction, avant la réponse', async () => {
    const body = await service.read(actor('admin', 'admin'), OZ_ID);
    expect(body).toHaveProperty('phone');
    expect(db.recordPlayerProfileView).toHaveBeenCalledWith({}, 'admin', PLAYER, 'PlayerAdminView');
  });

  it('audit en échec : aucune fiche', async () => {
    db.recordPlayerProfileView.mockRejectedValue(new Error('base indisponible'));
    await expect(service.read(actor('admin', 'admin'), OZ_ID)).rejects.toThrow('base indisponible');
  });

  it('inconnu ou caché : 404 ; visible sans vue (joueur non vérifié) : même 404', async () => {
    db.playerProfileByOzId.mockResolvedValue(null);
    await expect(service.read(actor('club'), OZ_ID)).rejects.toMatchObject({ status: 404 });
    db.playerProfileByOzId.mockResolvedValue(profile({ verificationStatus: 'declared' }));
    await expect(service.read(actor('club', 'un-autre'), OZ_ID)).rejects.toMatchObject({
      status: 404,
    });
    expect(logger.info).toHaveBeenCalledWith({ event: 'player.profile.refused' }, 'Fiche refusée');
  });

  it('mineur lu par son tuteur : minorité jugée à l’instant de la base', async () => {
    const guardian = actor('guardian', 'tuteur');
    // 18 ans le 2026-11-03 à l'horloge de la base : majeur, la tutelle est close.
    db.playerProfileByOzId.mockResolvedValue(
      profile({ userId: null, guardianUserId: 'tuteur', birthDate: new Date('2008-11-03') }),
    );
    expect(await service.read(guardian, OZ_ID)).not.toHaveProperty('phone');
    db.playerProfileByOzId.mockResolvedValue(
      profile({ userId: null, guardianUserId: 'tuteur', birthDate: new Date('2008-11-04') }),
    );
    expect(await service.read(guardian, OZ_ID)).toMatchObject({ phone: '+237690000001' });
  });

  it('journal sans OZ ID ni donnée de la fiche', async () => {
    await service.read(actor('player'), OZ_ID);
    db.playerProfileByOzId.mockResolvedValue(null);
    await service.read(actor('player'), OZ_ID).catch(() => undefined);
    const logged = JSON.stringify(logger.info.mock.calls);
    for (const secret of [OZ_ID, 'Yaoundé', '+237', 'Synthétique']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('au-delà de la limite : 429 avant toute lecture', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    await expect(service.read(actor('player'), OZ_ID)).rejects.toMatchObject({ status: 429 });
    expect(db.playerProfileByOzId).not.toHaveBeenCalled();
  });
});

describe('PlayerProfileService.setVisibility', () => {
  it('titulaire majeur : réglage rendu par la base', async () => {
    db.setPlayerVisibility.mockResolvedValue({ physical: false });
    expect(await service.setVisibility(actor('player'), OZ_ID, { physical: false })).toEqual({
      physical: false,
    });
    expect(db.setPlayerVisibility).toHaveBeenCalledWith({}, PLAYER, { physical: false });
    expect(consume).toHaveBeenCalledWith('player_visibility_update_account', USER);
  });

  it('mineur titulaire, tiers, inconnu ou refus de la base : 404, rien écrit sans droit', async () => {
    db.playerProfileByOzId.mockResolvedValue(profile({ birthDate: new Date('2012-06-07') }));
    await expect(
      service.setVisibility(actor('player'), OZ_ID, { sport: false }),
    ).rejects.toMatchObject({ status: 404 });
    db.playerProfileByOzId.mockResolvedValue(profile());
    await expect(
      service.setVisibility(actor('player', 'un-autre'), OZ_ID, { sport: false }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.setPlayerVisibility).not.toHaveBeenCalled();
    db.setPlayerVisibility.mockResolvedValue(null);
    await expect(
      service.setVisibility(actor('player'), OZ_ID, { sport: false }),
    ).rejects.toMatchObject({ status: 404 });
    db.playerProfileByOzId.mockResolvedValue(null);
    await expect(
      service.setVisibility(actor('player'), OZ_ID, { sport: false }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('tuteur vérifié d’un mineur : permis', async () => {
    db.playerProfileByOzId.mockResolvedValue(
      profile({ userId: null, guardianUserId: 'tuteur', birthDate: new Date('2012-06-07') }),
    );
    db.setPlayerVisibility.mockResolvedValue({ sport: false });
    expect(
      await service.setVisibility(actor('guardian', 'tuteur'), OZ_ID, { sport: false }),
    ).toEqual({ sport: false });
  });

  it('au-delà de la limite : 429 avant toute lecture', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    await expect(
      service.setVisibility(actor('player'), OZ_ID, { sport: false }),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.playerProfileByOzId).not.toHaveBeenCalled();
  });
});
