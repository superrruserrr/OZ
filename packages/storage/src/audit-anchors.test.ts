import { S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anchorKey, AuditAnchorStore, StorageError } from './index.js';

const CONFIG = {
  endpoint: 'http://127.0.0.1:1',
  region: 'fr-par',
  bucket: 'oz-audit-anchors',
  accessKey: 'oz-access',
  secretKey: 'super-secret-value',
};
const HASH = 'ab'.repeat(32);
const body = (value: unknown) => ({
  Body: { transformToString: () => Promise.resolve(JSON.stringify(value)) },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clés d’ancre', () => {
  it('inversées sur 20 chiffres : la plus récente vient en premier dans l’ordre des clés', () => {
    expect(anchorKey(1)).toBe('anchors/99999999999999999998');
    expect(anchorKey(1) > anchorKey(2)).toBe(true);
    expect(() => anchorKey(0)).toThrow(/position/);
    expect(() => anchorKey(1.5)).toThrow(/position/);
  });
});

describe('AuditAnchorStore', () => {
  it('écrit une ancre sans jamais écraser, verrou de rétention posé quand configuré', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const store = new AuditAnchorStore({ ...CONFIG, lockDays: 30 });
    const at = new Date('2026-11-07T10:00:00Z');
    await store.put({ position: 42, hash: HASH }, at);
    const input = (send.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> }).input;
    expect(input).toMatchObject({
      Bucket: 'oz-audit-anchors',
      Key: anchorKey(42),
      IfNoneMatch: '*',
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date('2026-12-07T10:00:00Z'),
    });
    expect(JSON.parse(String(input.Body))).toEqual({
      position: 42,
      hash: HASH,
      anchoredAt: '2026-11-07T10:00:00.000Z',
    });

    send.mockClear();
    await new AuditAnchorStore({ ...CONFIG, lockDays: 0 }).put({ position: 42, hash: HASH }, at);
    const unlocked = (send.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> })
      .input;
    expect(unlocked.ObjectLockMode).toBeUndefined();
  });

  it('ancre déjà écrite : `exists`, sans erreur ; position ou hachage hors format refusés', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(
      new S3ServiceException({
        name: 'PreconditionFailed',
        $fault: 'client',
        $metadata: { httpStatusCode: 412 },
      }),
    );
    const store = new AuditAnchorStore({ ...CONFIG, lockDays: 0 });
    expect(await store.put({ position: 42, hash: HASH })).toBe('exists');
    await expect(store.put({ position: 0, hash: HASH })).rejects.toThrow(/position/);
    await expect(store.put({ position: 1, hash: 'AB' })).rejects.toThrow(/hachage/);
    expect(() => new AuditAnchorStore({ ...CONFIG, lockDays: -1 })).toThrow(/rétention/);
  });

  it('dernière ancre : première clé listée, relue et validée ; aucune : null', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({ Contents: [{ Key: anchorKey(7) }] } as never)
      .mockResolvedValueOnce(
        body({ position: 7, hash: HASH, anchoredAt: '2026-11-07T10:00:00.000Z' }) as never,
      )
      .mockResolvedValueOnce({ Contents: [] } as never);
    const store = new AuditAnchorStore({ ...CONFIG, lockDays: 0 });
    expect(await store.latest()).toEqual({ position: 7, hash: HASH });
    expect((send.mock.calls[0]?.[0] as unknown as { input: unknown }).input).toMatchObject({
      Prefix: 'anchors/',
      MaxKeys: 1,
    });
    expect(await store.latest()).toBeNull();
  });

  it.each([
    ['clé hors format', { Contents: [{ Key: 'anchors/x' }] }, null],
    [
      'contenu contredisant la clé',
      { Contents: [{ Key: anchorKey(7) }] },
      { position: 8, hash: HASH, anchoredAt: '2026-11-07T10:00:00.000Z' },
    ],
    [
      'champ inattendu',
      { Contents: [{ Key: anchorKey(7) }] },
      { position: 7, hash: HASH, anchoredAt: '2026-11-07T10:00:00.000Z', extra: 1 },
    ],
    [
      'hachage hors format',
      { Contents: [{ Key: anchorKey(7) }] },
      { position: 7, hash: 'zz', anchoredAt: '2026-11-07T10:00:00.000Z' },
    ],
  ])('ancre illisible (%s) : erreur, jamais « aucune ancre »', async (_case, listed, content) => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce(listed as never);
    if (content !== null) send.mockResolvedValueOnce(body(content) as never);
    await expect(new AuditAnchorStore({ ...CONFIG, lockDays: 0 }).latest()).rejects.toThrow(
      StorageError,
    );
  });

  it('erreur du stockage : StorageError sans clé ni secret', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('réseau'));
    const error = await new AuditAnchorStore({ ...CONFIG, lockDays: 0 })
      .latest()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(String(error)).not.toContain('super-secret-value');
    expect(String(error)).not.toContain('anchors/');
  });
});
