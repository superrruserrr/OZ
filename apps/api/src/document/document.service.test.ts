import type { Actor } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type { DocumentUploadInput } from '@oz/contracts';
import type { PrismaClient } from '@oz/db';
import { StorageChangedError, type DocumentStorage } from '@oz/storage';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DocumentService } from './document.service.js';
import type { ScanQueue } from './scan-queue.js';

// Cas que le banc HTTP ne sait pas provoquer : courses entre lecture et écriture, pannes de la file.
const db = vi.hoisted(() => ({
  completeDocumentUpload: vi.fn(),
  createDocumentUpload: vi.fn(),
  documentTargetFor: vi.fn(),
  documentUploadFor: vi.fn(),
  rejectDocumentUpload: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);
const sniff = vi.hoisted(() => ({ SNIFF_BYTES: 4100, sniffContentType: vi.fn() }));
vi.mock('./sniff.js', () => sniff);

const USER = '00000000-0000-4000-8000-000000000001';
const UPLOAD = '00000000-0000-4000-8000-000000000002';
const DOCUMENT = '00000000-0000-4000-8000-000000000003';
const PLAYER = '00000000-0000-4000-8000-000000000004';
const ETAG = '"version-verifiee"';
const actor: Actor = {
  userId: USER,
  roles: [{ role: 'player', organizationId: null }],
  isKyc3Verified: false,
};
const ownPlayer = {
  kind: 'player',
  ownerUserId: USER,
  guardianUserId: null,
  organizationId: null,
  birthDate: new Date('1995-03-04'),
  checkedAt: new Date('2026-11-03T10:00:00Z'),
};
const issuedRow = {
  id: UPLOAD,
  status: 'issued',
  documentType: 'identity_document',
  target: { playerId: PLAYER },
  contentType: 'image/png',
  sizeBytes: 67,
  sha256: 'ab'.repeat(32),
  expiresAt: new Date('2026-11-03T10:05:00Z'),
  expired: false,
};
const input: DocumentUploadInput = {
  documentType: 'identity_document',
  playerId: PLAYER,
  contentType: 'image/png',
  sizeBytes: 67,
  sha256: 'ab'.repeat(32),
};

const storage = {
  presignPut: vi.fn(),
  head: vi.fn(),
  readHead: vi.fn(),
  copy: vi.fn(),
  remove: vi.fn(),
};
const enqueue = vi.fn();
const logger = { warn: vi.fn(), error: vi.fn() };
const service = new DocumentService(
  {} as PrismaClient,
  storage as unknown as DocumentStorage,
  { documentRetentionDays: 90 } as ApiConfig,
  { consume: () => Promise.resolve({ allowed: true }) } as unknown as RateLimiter,
  { enqueue } as unknown as ScanQueue,
  logger as unknown as PinoLogger,
);

beforeEach(() => {
  vi.clearAllMocks();
  db.documentTargetFor.mockResolvedValue(ownPlayer);
  db.documentUploadFor.mockResolvedValue(issuedRow);
  storage.head.mockResolvedValue({ size: 67, etag: ETAG });
  storage.readHead.mockResolvedValue(new Uint8Array(8));
  sniff.sniffContentType.mockResolvedValue('image/png');
});

describe('DocumentService.issue', () => {
  it('échéance annoncée : la plus proche de l’URL signée et de l’intention', async () => {
    db.createDocumentUpload.mockResolvedValue({
      id: UPLOAD,
      expiresAt: new Date('2026-11-03T10:05:00Z'),
    });
    storage.presignPut.mockResolvedValue({
      url: 'http://s3/x',
      headers: { 'x-amz-checksum-sha256': 'q6s=' },
      expiresAt: new Date('2026-11-03T10:04:59Z'),
    });
    expect((await service.issue(actor, input)).expiresAt).toBe('2026-11-03T10:04:59.000Z');
    storage.presignPut.mockResolvedValue({
      url: 'http://s3/x',
      headers: {},
      expiresAt: new Date('2026-11-03T10:06:00Z'),
    });
    const later = await service.issue(actor, input);
    expect(later.expiresAt).toBe('2026-11-03T10:05:00.000Z');
    expect(later.headers['x-amz-checksum-sha256']).toBe('');
  });

  it('cible sur une organisation ou un tuteur : transmise telle quelle', async () => {
    db.documentTargetFor.mockResolvedValue(null);
    for (const target of [{ guardianId: PLAYER }, { organizationId: PLAYER }]) {
      await expect(
        service.issue(actor, { ...input, playerId: undefined, ...target }),
      ).rejects.toMatchObject({ status: 404 });
      expect(db.documentTargetFor).toHaveBeenLastCalledWith({}, target);
    }
  });

  it('demande sans cible (contrat contourné) : erreur interne, aucune écriture', async () => {
    await expect(service.issue(actor, { ...input, playerId: undefined })).rejects.toThrow(
      'sans cible',
    );
    expect(db.createDocumentUpload).not.toHaveBeenCalled();
  });

  it('limite atteinte : 429, rien n’est lu', async () => {
    const limited = new DocumentService(
      {} as PrismaClient,
      storage as unknown as DocumentStorage,
      { documentRetentionDays: 90 } as ApiConfig,
      {
        consume: () => Promise.resolve({ allowed: false, retryAfterSeconds: 42 }),
      } as unknown as RateLimiter,
      { enqueue } as unknown as ScanQueue,
      logger as unknown as PinoLogger,
    );
    await expect(limited.issue(actor, input)).rejects.toMatchObject({ retryAfterSeconds: 42 });
    expect(db.withUserContext).not.toHaveBeenCalled();
  });
});

describe('DocumentService.complete', () => {
  it('réception : copie de la version vérifiée, transaction bornée, envoi supprimé après', async () => {
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    expect(await service.complete(actor, UPLOAD)).toEqual({
      documentId: DOCUMENT,
      status: 'pending',
    });
    expect(storage.readHead).toHaveBeenCalledWith(`incoming/${UPLOAD}`, 4100, ETAG);
    expect(storage.copy).toHaveBeenCalledWith(`incoming/${UPLOAD}`, `quarantine/${DOCUMENT}`, ETAG);
    expect(db.withUserContext).toHaveBeenLastCalledWith({}, USER, expect.any(Function), {
      timeoutMs: 60_000,
    });
    expect(storage.remove).toHaveBeenCalledWith(`incoming/${UPLOAD}`);
    expect(storage.remove.mock.invocationCallOrder[0]).toBeGreaterThan(
      enqueue.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('suppression de l’envoi impossible après réception : succès, orphelin journalisé', async () => {
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    storage.remove.mockRejectedValueOnce(new Error('stockage indisponible'));
    await expect(service.complete(actor, UPLOAD)).resolves.toMatchObject({ status: 'pending' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'document.upload.discard_failed' }),
      expect.any(String),
    );
  });

  it('copie trop lente : copie retirée, aucun job, 503 avant le terme de la transaction', async () => {
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0).mockReturnValue(45_001);
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status: 503 });
    now.mockRestore();
    expect(enqueue).not.toHaveBeenCalled();
    expect(storage.remove.mock.calls).toEqual([[`quarantine/${DOCUMENT}`]]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'document.upload.deadline_exceeded' }),
      expect.any(String),
    );
  });

  it('Redis muet : mise en file abandonnée après 5 s, 503', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
      enqueue.mockReturnValue(new Promise(() => undefined));
      const pending = service.complete(actor, UPLOAD);
      const settled = expect(pending).rejects.toMatchObject({ status: 503 });
      await vi.advanceTimersByTimeAsync(5_000);
      await settled;
      expect(storage.remove.mock.calls).toEqual([[`quarantine/${DOCUMENT}`]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('copie non retirée après un échec de mise en file : 503 quand même, orphelin journalisé', async () => {
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    enqueue.mockRejectedValue(new Error('redis indisponible'));
    storage.remove.mockRejectedValueOnce(new Error('stockage indisponible'));
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status: 503 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'document.scan.quarantine_cleanup_failed' }),
      expect.any(String),
    );
  });

  it('mise en file impossible : copie retirée, envoi intact, 503, la transaction est annulée', async () => {
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    enqueue.mockRejectedValue(new Error('redis indisponible'));
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(storage.remove.mock.calls).toEqual([[`quarantine/${DOCUMENT}`]]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'document.scan.enqueue_failed', documentId: DOCUMENT }),
      expect.any(String),
    );
  });

  it.each([
    ['already_used', 409],
    ['not_found', 404],
  ] as const)(
    'réception concurrente (%s) entre la vérification et l’écriture : %i',
    async (outcome, status) => {
      db.completeDocumentUpload.mockResolvedValue({ outcome, documentId: null });
      await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status });
      expect(storage.copy).not.toHaveBeenCalled();
    },
  );

  it('rejet perdu au profit d’une réception concurrente : 409, objet supprimé', async () => {
    storage.head.mockResolvedValue({ size: 68 });
    db.rejectDocumentUpload.mockResolvedValue(false);
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({
      status: 409,
      code: 'DOCUMENT_UPLOAD_USED',
    });
    expect(storage.remove).toHaveBeenCalledWith(`incoming/${UPLOAD}`);
  });

  it.each([
    ['disparu', () => storage.readHead.mockResolvedValue(null)],
    ['remplacé', () => storage.readHead.mockRejectedValue(new StorageChangedError())],
  ])(
    'objet %s entre l’en-tête et la lecture (réception concurrente) : 409, ni alerte ni rejet',
    async (_label, arrange) => {
      arrange();
      await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({
        status: 409,
        code: 'DOCUMENT_UPLOAD_MISSING',
      });
      expect(logger.warn).not.toHaveBeenCalled();
      expect(db.rejectDocumentUpload).not.toHaveBeenCalled();
    },
  );

  it('objet remplacé entre la lecture et la copie : 409, la transaction est annulée', async () => {
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    storage.copy.mockRejectedValueOnce(new StorageChangedError());
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status: 409 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('panne du stockage à la lecture ou à la copie : l’erreur remonte telle quelle', async () => {
    const failure = new Error('stockage indisponible');
    storage.readHead.mockRejectedValueOnce(failure);
    await expect(service.complete(actor, UPLOAD)).rejects.toBe(failure);
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'completed', documentId: DOCUMENT });
    storage.copy.mockRejectedValueOnce(failure);
    await expect(service.complete(actor, UPLOAD)).rejects.toBe(failure);
  });

  it.each([
    ['expired', 410],
    ['completed', 409],
    ['rejected', 409],
  ] as const)('intention déjà `%s` : %i sans toucher au stockage', async (status, code) => {
    db.documentUploadFor.mockResolvedValue({ ...issuedRow, status });
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status: code });
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('échue mais encore `issued` : aucune vérification du fichier, la base tranche (410)', async () => {
    db.documentUploadFor.mockResolvedValue({ ...issuedRow, expired: true });
    db.completeDocumentUpload.mockResolvedValue({ outcome: 'expired', documentId: null });
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status: 410 });
    expect(storage.head).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(`incoming/${UPLOAD}`);
    // Suppression impossible : toujours 410, l'orphelin est journalisé.
    storage.remove.mockRejectedValueOnce(new Error('stockage indisponible'));
    await expect(service.complete(actor, UPLOAD)).rejects.toMatchObject({ status: 410 });
  });
});
