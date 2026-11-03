import type { Actor } from '@oz/auth';
import type { PrismaClient } from '@oz/db';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { AuditLogService, decodeCursor, encodeCursor } from './audit-log.service.js';

// Journal d'audit (lot 1.16a, tâche 5) : curseur opaque, filtres transmis à la base sous le contexte
// de l'acteur, métadonnées sérialisées, limite par compte, journal sans valeur de filtre.
const db = vi.hoisted(() => ({
  listAuditLog: vi.fn(),
  latestAuditCheck: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const ADMIN = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';
const admin: Actor = {
  userId: ADMIN,
  roles: [{ role: 'admin', organizationId: null }],
  isKyc3Verified: false,
};
const createdAt = new Date('2026-11-03T10:00:00Z');
const entry = (position: number) => ({
  id: `00000000-0000-4000-8000-0000000000${String(position).padStart(2, '0')}`,
  position,
  actorUserId: ADMIN,
  action: 'document.read.granted',
  targetType: 'document',
  targetId: TARGET,
  reason: 'motif',
  requestId: null,
  metadata: { document_type: 'identity_document' },
  createdAt,
  hash: 'ab'.repeat(32),
});

const consume = vi.fn();
const logger = { info: vi.fn() };
const service = new AuditLogService(
  {} as PrismaClient,
  { consume } as unknown as RateLimiter,
  logger as unknown as PinoLogger,
);

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue({ allowed: true });
  db.listAuditLog.mockResolvedValue({ entries: [entry(12), entry(11)], nextBefore: 11 });
  db.latestAuditCheck.mockResolvedValue(null);
});

describe('curseur', () => {
  it('aller-retour ; forme non canonique, nulle ou étrangère : refusée', () => {
    for (const position of [1, 42, Number.MAX_SAFE_INTEGER]) {
      expect(decodeCursor(encodeCursor(position))).toBe(position);
    }
    expect(encodeCursor(42)).toMatch(/^[A-Za-z0-9_-]+$/);
    const forged = (text: string) => Buffer.from(text).toString('base64url');
    for (const text of ['p:0', 'p:042', 'p:-1', 'p:1.5', '42', 'p:99999999999999999', 'p:1 ']) {
      expect(decodeCursor(forged(text))).toBeNull();
    }
    // Même octets, autre encodage (bits de remplissage) : refusé.
    expect(decodeCursor(`${encodeCursor(4).slice(0, -1)}B`)).toBeNull();
    expect(decodeCursor('zz')).toBeNull();
  });
});

describe('AuditLogService.list', () => {
  it('filtres transmis sous le contexte de l’acteur ; page et curseur suivant', async () => {
    const page = await service.list(admin, {
      limit: 2,
      cursor: encodeCursor(13),
      action: 'document.read.granted',
      targetType: 'document',
      targetId: TARGET,
      from: '2026-11-01T00:00:00+01:00',
      to: '2026-11-04T00:00:00Z',
    });
    expect(db.withUserContext).toHaveBeenCalledWith({}, ADMIN, expect.any(Function));
    expect(db.listAuditLog).toHaveBeenCalledWith(
      {},
      {
        limit: 2,
        before: 13,
        action: 'document.read.granted',
        targetType: 'document',
        targetId: TARGET,
        actorUserId: undefined,
        from: new Date('2026-10-31T23:00:00Z'),
        to: new Date('2026-11-04T00:00:00Z'),
      },
    );
    expect(page.nextCursor).toBe(encodeCursor(11));
    expect(page.entries[0]).toEqual({
      ...entry(12),
      metadata: '{"document_type":"identity_document"}',
      createdAt: '2026-11-03T10:00:00.000Z',
    });
  });

  it('dernière page : curseur nul ; première page : aucune borne', async () => {
    db.listAuditLog.mockResolvedValue({ entries: [], nextBefore: null });
    expect(await service.list(admin, { limit: 50 })).toEqual({ entries: [], nextCursor: null });
    expect(db.listAuditLog).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ before: undefined }),
    );
  });

  it('journal : noms des filtres et nombre d’entrées, jamais leurs valeurs', async () => {
    await service.list(admin, { limit: 50, targetId: TARGET, actorUserId: ADMIN });
    expect(logger.info).toHaveBeenCalledWith(
      { event: 'audit.log.read', filters: ['targetId', 'actorUserId'], count: 2 },
      "Journal d'audit consulté",
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(TARGET);
  });

  it('curseur invalide : 422 sur `cursor`, avant toute consommation ou lecture', async () => {
    const refused = service.list(admin, { limit: 50, cursor: 'cDow' });
    await expect(refused).rejects.toBeInstanceOf(AppException);
    await expect(refused).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'cursor', code: 'invalid_cursor' }],
    });
    expect(consume).not.toHaveBeenCalled();
    expect(db.listAuditLog).not.toHaveBeenCalled();
  });

  it('limite par compte atteinte : 429, rien n’est lu', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    await expect(service.list(admin, { limit: 50 })).rejects.toBeInstanceOf(RateLimitedException);
    expect(consume).toHaveBeenCalledWith('audit_log_read_account', ADMIN);
    expect(db.listAuditLog).not.toHaveBeenCalled();
  });
});

describe('AuditLogService.integrity', () => {
  it('jamais vérifiée : `lastCheck` nul', async () => {
    expect(await service.integrity(admin)).toEqual({ lastCheck: null });
    expect(db.withUserContext).toHaveBeenCalledWith({}, ADMIN, expect.any(Function));
  });

  it('intègre ou en défaut', async () => {
    db.latestAuditCheck.mockResolvedValue({
      checkedAt: createdAt,
      headPosition: 12,
      anchorPosition: 10,
      defectPosition: null,
    });
    expect(await service.integrity(admin)).toEqual({
      lastCheck: {
        checkedAt: '2026-11-03T10:00:00.000Z',
        headPosition: 12,
        anchorPosition: 10,
        isIntact: true,
        defectPosition: null,
      },
    });
    db.latestAuditCheck.mockResolvedValue({
      checkedAt: createdAt,
      headPosition: 12,
      anchorPosition: null,
      defectPosition: 4,
    });
    expect(await service.integrity(admin)).toMatchObject({
      lastCheck: { isIntact: false, defectPosition: 4 },
    });
  });

  it('limite par compte atteinte : 429', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    await expect(service.integrity(admin)).rejects.toBeInstanceOf(RateLimitedException);
    expect(db.latestAuditCheck).not.toHaveBeenCalled();
  });
});
