import { S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanKey,
  DocumentStorage,
  incomingKey,
  quarantineKey,
  StorageChangedError,
  StorageError,
} from './index.js';

const UUID = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const CONFIG = {
  endpoint: 'http://127.0.0.1:1',
  region: 'fr-par',
  bucket: 'oz-documents',
  accessKey: 'oz-access',
  secretKey: 'super-secret-value',
};

describe('clés de stockage', () => {
  it('incoming/, quarantine/ et clean/ suivis d’un UUID', () => {
    expect(incomingKey(UUID)).toBe(`incoming/${UUID}`);
    expect(quarantineKey(UUID.toUpperCase())).toBe(`quarantine/${UUID.toUpperCase()}`);
    expect(cleanKey(UUID)).toBe(`clean/${UUID}`);
  });

  it.each(['', '../etc/passwd', `${UUID}/x`, 'not-a-uuid', `${UUID} `])(
    'refuse un segment qui n’est pas un UUID : %j',
    (value) => {
      expect(() => incomingKey(value)).toThrow(/UUID/);
      expect(() => quarantineKey(value)).toThrow(/UUID/);
      expect(() => cleanKey(value)).toThrow(/UUID/);
    },
  );
});

describe('DocumentStorage', () => {
  const storage = new DocumentStorage(CONFIG);

  it.each([
    'photo.png',
    'quarantine/x',
    `other/${UUID}`,
    `incoming/${UUID}/x`,
    `/incoming/${UUID}`,
  ])('refuse une clé hors des deux préfixes : %j', async (key) => {
    await expect(storage.head(key)).rejects.toThrow(/clé de stockage/);
    await expect(storage.readHead(key, 8)).rejects.toThrow(/clé de stockage/);
    await expect(storage.read(key, 8)).rejects.toThrow(/clé de stockage/);
    await expect(storage.put(key, new Uint8Array([1]), 'image/png')).rejects.toThrow(
      /clé de stockage/,
    );
    await expect(storage.remove(key)).rejects.toThrow(/clé de stockage/);
    await expect(storage.copy(key, quarantineKey(UUID))).rejects.toThrow(/clé de stockage/);
    await expect(storage.copy(incomingKey(UUID), key)).rejects.toThrow(/clé de stockage/);
  });

  it('présigne sans contacter le stockage ; en-têtes signés à renvoyer tels quels', async () => {
    const before = Date.now();
    const out = await storage.presignPut({
      key: incomingKey(UUID),
      contentType: 'image/png',
      contentLength: 1234,
      sha256: 'ab'.repeat(32),
      expiresInSeconds: 300,
    });
    const url = new URL(out.url);
    expect(url.pathname).toBe(`/oz-documents/incoming/${UUID}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signedHeaders).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host', 'x-amz-checksum-sha256']),
    );
    expect(out.headers).toEqual({
      'content-type': 'image/png',
      'content-length': '1234',
      'x-amz-checksum-sha256': Buffer.from('ab'.repeat(32), 'hex').toString('base64'),
    });
    // Date de signature à la seconde : l'échéance annoncée n'est jamais plus tardive que la réelle.
    expect(out.expiresAt.getTime()).toBeGreaterThan(before + 298_000);
    expect(out.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 300_000);
    expect(out.url).not.toContain(CONFIG.secretKey);
  });

  it.each([
    [{ contentLength: 0 }, /taille/],
    [{ contentLength: 1.5 }, /taille/],
    [{ sha256: 'xyz' }, /SHA-256/],
    [{ expiresInSeconds: 0 }, /durée/],
    [{ expiresInSeconds: 3601 }, /durée/],
    [{ contentType: '' }, /type/],
  ])('refuse des paramètres hors bornes %j', async (override, message) => {
    await expect(
      storage.presignPut({
        key: incomingKey(UUID),
        contentType: 'image/png',
        contentLength: 10,
        sha256: 'ab'.repeat(32),
        expiresInSeconds: 300,
        ...override,
      }),
    ).rejects.toThrow(message);
  });

  it('présigne une lecture de clean/ : 5 minutes au plus, type et téléchargement imposés', async () => {
    const before = Date.now();
    const out = await storage.presignGet({
      key: cleanKey(UUID),
      contentType: 'application/pdf',
      expiresInSeconds: 300,
    });
    const url = new URL(out.url);
    expect(url.pathname).toBe(`/oz-documents/clean/${UUID}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment');
    expect(url.searchParams.get('response-cache-control')).toBe('no-store');
    expect(out.expiresAt.getTime()).toBeGreaterThan(before + 298_000);
    expect(out.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 300_000);
    expect(out.url).not.toContain(CONFIG.secretKey);
  });

  it('presignGet : date de signature imposée (tests d’expiration, CP-22)', async () => {
    const signingDate = new Date('2026-11-02T12:00:00Z');
    const out = await storage.presignGet({
      key: cleanKey(UUID),
      contentType: 'image/png',
      expiresInSeconds: 60,
      signingDate,
    });
    expect(new URL(out.url).searchParams.get('X-Amz-Date')).toBe('20261102T120000Z');
    expect(out.expiresAt).toEqual(new Date('2026-11-02T12:01:00Z'));
  });

  it.each([incomingKey(UUID), quarantineKey(UUID), 'photo.png'])(
    'presignGet ne sert que clean/ (CP-21) : %j',
    async (key) => {
      await expect(
        storage.presignGet({ key, contentType: 'image/png', expiresInSeconds: 300 }),
      ).rejects.toThrow(/clé de stockage|clean\//);
    },
  );

  it.each([
    [{ expiresInSeconds: 0 }, /durée/],
    [{ expiresInSeconds: 301 }, /durée/],
    [{ expiresInSeconds: 1.5 }, /durée/],
    [{ contentType: '' }, /type/],
  ])('presignGet refuse des paramètres hors bornes %j', async (override, message) => {
    await expect(
      storage.presignGet({
        key: cleanKey(UUID),
        contentType: 'image/png',
        expiresInSeconds: 300,
        ...override,
      }),
    ).rejects.toThrow(message);
  });

  it('put n’écrit que sous clean/ : ni incoming/ ni quarantine/', async () => {
    for (const key of [incomingKey(UUID), quarantineKey(UUID)]) {
      await expect(storage.put(key, new Uint8Array([1]), 'image/png')).rejects.toThrow(/clean\//);
    }
  });

  it.each([
    ['vide', new Uint8Array(), 'image/png', /taille/],
    ['> 50 Mo', new Uint8Array(52_428_801), 'image/png', /taille/],
    ['type absent', new Uint8Array([1]), '', /type/],
  ])('put refuse un contenu %s', async (_label, body, type, message) => {
    await expect(storage.put(cleanKey(UUID), body, type)).rejects.toThrow(message);
  });

  it('read refuse une borne nulle, fractionnaire ou au-delà de 50 Mo', async () => {
    for (const max of [0, 1.5, 52_428_801]) {
      await expect(storage.read(quarantineKey(UUID), max)).rejects.toThrow(/borne/);
    }
  });

  it('readHead refuse une longueur nulle ou absurde', async () => {
    await expect(storage.readHead(incomingKey(UUID), 0)).rejects.toThrow(/octets/);
    await expect(storage.readHead(incomingKey(UUID), 1_048_577)).rejects.toThrow(/octets/);
  });

  it('une panne du stockage remonte sans le secret dans le message', async () => {
    const error = await storage.head(incomingKey(UUID)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(CONFIG.secretKey);
    expect(JSON.stringify(error)).not.toContain(CONFIG.secretKey);
  });
});

describe('erreurs du stockage', () => {
  const storage = new DocumentStorage(CONFIG);
  const s3Error = (name: string, status: number) =>
    new S3ServiceException({ name, $fault: 'client', $metadata: { httpStatusCode: status } });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['readHead', () => storage.readHead(incomingKey(UUID), 8), /GET/],
    ['copy', () => storage.copy(incomingKey(UUID), quarantineKey(UUID)), /COPY/],
    ['remove', () => storage.remove(incomingKey(UUID)), /DELETE/],
    ['read', () => storage.read(quarantineKey(UUID), 8), /GET/],
    ['put', () => storage.put(cleanKey(UUID), new Uint8Array([1]), 'image/png'), /PUT/],
  ])('%s : panne → StorageError nommant l’opération, sans secret', async (_name, call, op) => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(s3Error('AccessDenied', 403));
    const error = await call().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as Error).message).toMatch(op);
    expect((error as Error).message).toContain('AccessDenied (403)');
    expect(JSON.stringify(error)).not.toContain(CONFIG.secretKey);
  });

  it('une erreur réseau ou une valeur non Error est décrite par son nom seul', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(new TypeError('boom'));
    await expect(storage.head(incomingKey(UUID))).rejects.toThrow(/HEAD a échoué, TypeError$/);
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce('chaîne');
    await expect(storage.head(incomingKey(UUID))).rejects.toThrow(/HEAD a échoué, inconnue$/);
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(
      new S3ServiceException({ name: 'SlowDown', $fault: 'server', $metadata: {} }),
    );
    await expect(storage.head(incomingKey(UUID))).rejects.toThrow(/SlowDown \(\?\)/);
  });

  it.each([
    ['NotFound', 404],
    ['NoSuchKey', 404],
    ['Other', 404],
  ])('objet absent (%s, %d) : null ou suppression silencieuse', async (name, status) => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(s3Error(name, status));
    expect(await storage.head(incomingKey(UUID))).toBeNull();
    expect(await storage.readHead(incomingKey(UUID), 8)).toBeNull();
    expect(await storage.read(quarantineKey(UUID), 8)).toBeNull();
    await expect(storage.remove(incomingKey(UUID))).resolves.toBeUndefined();
  });

  it.each([
    ['PreconditionFailed', 412],
    ['Other', 412],
  ])(
    'objet modifié depuis sa vérification (%s, %d) : StorageChangedError',
    async (name, status) => {
      vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(s3Error(name, status));
      await expect(storage.readHead(incomingKey(UUID), 8, '"e"')).rejects.toBeInstanceOf(
        StorageChangedError,
      );
      await expect(
        storage.copy(incomingKey(UUID), quarantineKey(UUID), '"e"'),
      ).rejects.toBeInstanceOf(StorageChangedError);
      await expect(storage.read(quarantineKey(UUID), 8, '"e"')).rejects.toBeInstanceOf(
        StorageChangedError,
      );
    },
  );

  it('réponses sans taille ni corps : taille 0, contenu vide', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    expect(await storage.head(incomingKey(UUID))).toEqual({ size: 0, etag: '' });
    expect(await storage.readHead(incomingKey(UUID), 8)).toEqual(new Uint8Array());
    expect(await storage.read(quarantineKey(UUID), 8)).toEqual(new Uint8Array());
  });

  it('read : objet annoncé plus grand que la borne refusé sans lire le corps', async () => {
    const transformToByteArray = vi.fn();
    const destroy = vi.fn();
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 9,
      Body: { transformToByteArray, destroy },
    } as never);
    await expect(storage.read(quarantineKey(UUID), 8)).rejects.toThrow(/borne/);
    expect(transformToByteArray).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ContentLength: 9 } as never);
    await expect(storage.read(quarantineKey(UUID), 8)).rejects.toThrow(/borne/);
  });

  it('read : corps plus long que la borne (taille non annoncée) refusé', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(9)) },
    } as never);
    await expect(storage.read(quarantineKey(UUID), 8)).rejects.toThrow(/borne/);
  });
});

describe('list (lot 1.9cb, objets orphelins)', () => {
  const storage = new DocumentStorage(CONFIG);
  const OTHER = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708193';
  const old = new Date('2026-11-01T00:00:00Z');
  const fresh = new Date('2026-11-02T12:00:00Z');
  const cutoff = new Date('2026-11-02T00:00:00Z');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rend les objets plus anciens que la borne, clés hors format ignorées, sur plusieurs pages', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Contents: [
          { Key: `clean/${UUID}`, LastModified: old },
          { Key: `clean/${OTHER}`, LastModified: fresh },
          { Key: 'clean/pas-un-uuid', LastModified: old },
          { LastModified: old },
          { Key: `clean/${OTHER}x` },
        ],
        IsTruncated: true,
        NextContinuationToken: 'suite',
      } as never)
      .mockResolvedValueOnce({
        Contents: [{ Key: `clean/${OTHER.toUpperCase()}`, LastModified: old }],
        IsTruncated: false,
      } as never);
    expect(await storage.list('clean/', { olderThan: cutoff, limit: 1000 })).toEqual({
      objects: [
        { key: `clean/${UUID}`, lastModified: old },
        { key: `clean/${OTHER.toUpperCase()}`, lastModified: old },
      ],
      next: undefined,
    });
    const inputs = send.mock.calls.map(
      ([command]) => (command as unknown as { input: Record<string, unknown> }).input,
    );
    expect(inputs).toEqual([
      {
        Bucket: 'oz-documents',
        Prefix: 'clean/',
        MaxKeys: 1000,
        ContinuationToken: undefined,
        StartAfter: undefined,
      },
      {
        Bucket: 'oz-documents',
        Prefix: 'clean/',
        MaxKeys: 995,
        ContinuationToken: 'suite',
        StartAfter: undefined,
      },
    ]);
  });

  it('n’examine pas plus de `limit` objets et rend le curseur ; reprise après le curseur', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      Contents: [
        { Key: `incoming/${UUID}`, LastModified: old },
        { Key: `incoming/${OTHER}`, LastModified: old },
      ],
      IsTruncated: true,
      NextContinuationToken: 'suite',
    } as never);
    const page = await storage.list('incoming/', { olderThan: cutoff, limit: 2 });
    expect(page.objects).toHaveLength(2);
    expect(page.next).toBe(`incoming/${OTHER}`);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValueOnce({ IsTruncated: false } as never);
    expect(
      await storage.list('incoming/', {
        olderThan: cutoff,
        limit: 5,
        startAfter: `incoming/${OTHER}`,
      }),
    ).toEqual({ objects: [], next: undefined });
    expect((send.mock.calls[1]?.[0] as { input: { StartAfter?: string } }).input.StartAfter).toBe(
      `incoming/${OTHER}`,
    );
    // Page tronquée sans contenu ni jeton : fin du listage, aucun curseur.
    send.mockResolvedValueOnce({ IsTruncated: true } as never);
    expect(await storage.list('quarantine/', { olderThan: cutoff, limit: 5 })).toEqual({
      objects: [],
      next: undefined,
    });
  });

  it('refuse un autre préfixe et une borne hors de 1 à 10 000 ; panne → StorageError', async () => {
    await expect(
      storage.list('autre/' as 'clean/', { olderThan: cutoff, limit: 10 }),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.list('clean/', { olderThan: cutoff, limit: 10, startAfter: `incoming/${UUID}` }),
    ).rejects.toThrow(TypeError);
    await expect(storage.list('clean/', { olderThan: cutoff, limit: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(storage.list('clean/', { olderThan: cutoff, limit: 10_001 })).rejects.toThrow(
      RangeError,
    );
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new TypeError('boom'));
    await expect(storage.list('clean/', { olderThan: cutoff, limit: 10 })).rejects.toThrow(
      /LIST a échoué, TypeError$/,
    );
  });
});
