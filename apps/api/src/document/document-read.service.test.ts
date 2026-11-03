import type { Actor } from '@oz/auth';
import type { PrismaClient } from '@oz/db';
import type { DocumentStorage } from '@oz/storage';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DocumentReadService, READ_URL_SECONDS } from './document-read.service.js';

// Lecture (lot 1.9ca) : 404 uniforme, audit avant toute URL, limite par compte.
const db = vi.hoisted(() => ({
  readableDocumentFor: vi.fn(),
  recordDocumentRead: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const DOCUMENT = '00000000-0000-4000-8000-000000000003';
const player: Actor = {
  userId: USER,
  roles: [{ role: 'player', organizationId: null }],
  isKyc3Verified: false,
};
const checkedAt = new Date('2026-11-03T10:00:00Z');
const readable = (target: Record<string, unknown> = {}) => ({
  id: DOCUMENT,
  type: 'identity_document',
  mimeType: 'image/png',
  storageKey: `clean/${DOCUMENT}`,
  target: {
    kind: 'player',
    ownerUserId: USER,
    guardianUserId: null,
    organizationId: null,
    birthDate: new Date('1995-03-04'),
    checkedAt,
    ...target,
  },
});

const storage = { presignGet: vi.fn() };
const consume = vi.fn();
const logger = { info: vi.fn() };
const service = new DocumentReadService(
  {} as PrismaClient,
  storage as unknown as DocumentStorage,
  { consume } as unknown as RateLimiter,
  logger as unknown as PinoLogger,
);

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue({ allowed: true });
  db.readableDocumentFor.mockResolvedValue(readable());
  storage.presignGet.mockResolvedValue({
    url: 'http://s3/clean/x?X-Amz-Signature=ab',
    expiresAt: new Date('2026-11-03T10:05:00Z'),
  });
});

describe('DocumentReadService.read', () => {
  it('pièce saine et droit : audit, puis URL de 5 minutes sur clean/, type imposé', async () => {
    const order: string[] = [];
    db.recordDocumentRead.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    storage.presignGet.mockImplementation(() => {
      order.push('url');
      return Promise.resolve({ url: 'http://s3/x', expiresAt: new Date('2026-11-03T10:05:00Z') });
    });
    expect(await service.read(player, DOCUMENT)).toEqual({
      url: 'http://s3/x',
      expiresAt: '2026-11-03T10:05:00.000Z',
    });
    expect(order).toEqual(['audit', 'url']);
    expect(db.recordDocumentRead).toHaveBeenCalledWith({}, USER, {
      id: DOCUMENT,
      type: 'identity_document',
    });
    expect(storage.presignGet).toHaveBeenCalledWith({
      key: `clean/${DOCUMENT}`,
      contentType: 'image/png',
      expiresInSeconds: READ_URL_SECONDS,
    });
    expect(READ_URL_SECONDS).toBe(300);
    expect(consume).toHaveBeenCalledWith('document_read_account', USER);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('http://s3');
  });

  it('pièce absente, cachée, non saine ou purgée : 404, ni audit ni URL, refus journalisé', async () => {
    db.readableDocumentFor.mockResolvedValue(null);
    await expect(service.read(player, DOCUMENT)).rejects.toMatchObject({ status: 404 });
    expect(logger.info).toHaveBeenCalledWith(
      { event: 'document.read.refused', documentId: DOCUMENT },
      'Lecture refusée',
    );
    expect(db.recordDocumentRead).not.toHaveBeenCalled();
    expect(storage.presignGet).not.toHaveBeenCalled();
  });

  it('pièce visible sans droit `document.read` : même 404', async () => {
    db.readableDocumentFor.mockResolvedValue(readable({ ownerUserId: 'un-autre' }));
    await expect(service.read(player, DOCUMENT)).rejects.toMatchObject({ status: 404 });
    expect(db.recordDocumentRead).not.toHaveBeenCalled();
    expect(storage.presignGet).not.toHaveBeenCalled();
  });

  it('tutelle : minorité jugée à l’instant de la base, pas à l’horloge de l’API', async () => {
    const guardian: Actor = {
      userId: USER,
      roles: [{ role: 'guardian', organizationId: null }],
      isKyc3Verified: false,
    };
    // 18 ans le 2026-11-03 à l'horloge de la base : majeur, la tutelle est close.
    db.readableDocumentFor.mockResolvedValue(
      readable({ ownerUserId: null, guardianUserId: USER, birthDate: new Date('2008-11-03') }),
    );
    await expect(service.read(guardian, DOCUMENT)).rejects.toMatchObject({ status: 404 });
    db.readableDocumentFor.mockResolvedValue(
      readable({ ownerUserId: null, guardianUserId: USER, birthDate: new Date('2008-11-04') }),
    );
    await expect(service.read(guardian, DOCUMENT)).resolves.toMatchObject({
      url: 'http://s3/clean/x?X-Amz-Signature=ab',
    });
  });

  it('identifiant mal formé : refus journalisé sans la valeur reçue', async () => {
    db.readableDocumentFor.mockResolvedValue(null);
    await expect(service.read(player, '<script>')).rejects.toMatchObject({ status: 404 });
    expect(logger.info).toHaveBeenCalledWith({ event: 'document.read.refused' }, 'Lecture refusée');
  });

  it('audit en échec : aucune URL', async () => {
    db.recordDocumentRead.mockRejectedValue(new Error('base indisponible'));
    await expect(service.read(player, DOCUMENT)).rejects.toThrow('base indisponible');
    expect(storage.presignGet).not.toHaveBeenCalled();
  });

  it('au-delà de la limite : 429 avant toute lecture', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    await expect(service.read(player, DOCUMENT)).rejects.toMatchObject({ status: 429 });
    expect(db.readableDocumentFor).not.toHaveBeenCalled();
  });
});
