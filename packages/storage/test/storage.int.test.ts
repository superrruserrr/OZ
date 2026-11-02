import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentStorage, incomingKey, quarantineKey, StorageChangedError } from '../src/index.js';
import { startStorage, type TestStorage } from './seaweed.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const id = () => crypto.randomUUID();

let s3: TestStorage | undefined;
let storage: DocumentStorage | undefined;

const ready = () => {
  if (s3 === undefined || storage === undefined) throw new Error('stockage de test non démarré');
  return { s3, storage };
};

beforeAll(async () => {
  s3 = await startStorage();
  storage = new DocumentStorage(s3.config);
});

afterAll(async () => {
  storage?.destroy();
  await s3?.stop();
});

// fetch pose lui-même `content-length` d'après le corps (en-tête interdit) : un corps d'une autre
// taille envoie donc une autre longueur que celle signée, comme le ferait un navigateur.
const put = (url: string, headers: Readonly<Record<string, string>>, body: Buffer) => {
  const rest = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name !== 'content-length'),
  );
  return fetch(url, { method: 'PUT', headers: rest, body });
};

const signed = (key: string, body = PNG, expiresInSeconds = 300) =>
  ready().storage.presignPut({
    key,
    contentType: 'image/png',
    contentLength: body.length,
    sha256: sha256(body),
    expiresInSeconds,
  });

describe('dépôt par PUT présigné (D1)', () => {
  it('accepte l’envoi conforme ; HEAD rend la taille réelle', async () => {
    const key = incomingKey(id());
    const { url, headers, expiresAt } = await signed(key);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 290_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 300_000);
    const res = await put(url, headers, PNG);
    expect(res.status).toBe(200);
    expect(await ready().storage.head(key)).toMatchObject({ size: PNG.length });
  });

  it('refuse un autre type de contenu que celui signé', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    const res = await put(url, { ...headers, 'content-type': 'application/pdf' }, PNG);
    expect(res.status).toBe(403);
    expect(await ready().storage.head(key)).toBeNull();
  });

  it('refuse une autre taille que celle signée', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    const bigger = Buffer.concat([PNG, Buffer.alloc(10)]);
    const res = await put(url, headers, bigger);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await ready().storage.head(key)).toBeNull();
  });

  it('refuse un contenu dont la SHA-256 diffère de celle signée', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    const forged = Buffer.from(PNG);
    forged.writeUInt8(forged.readUInt8(forged.length - 1) ^ 0xff, forged.length - 1);
    const res = await put(url, headers, forged);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await ready().storage.head(key)).toBeNull();
  });

  it('refuse une signature altérée', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    const res = await put(
      url.replace(/X-Amz-Signature=[0-9a-f]/, 'X-Amz-Signature=0'),
      headers,
      PNG,
    );
    expect(res.status).toBe(403);
  });

  it('refuse un envoi après expiration', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key, PNG, 1);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const res = await put(url, headers, PNG);
    expect(res.status).toBe(403);
    expect(await ready().storage.head(key)).toBeNull();
  });

  it('le bucket refuse toute lecture anonyme', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    await put(url, headers, PNG);
    const { config } = ready().s3;
    const res = await fetch(`${config.endpoint}/${config.bucket}/${key}`);
    expect(res.status).toBe(403);
  });
});

describe('lecture partielle, déplacement, suppression', () => {
  it('readHead ne rend que les premiers octets demandés', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    await put(url, headers, PNG);
    const head = await ready().storage.readHead(key, 8);
    expect(Buffer.from(head ?? []).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('readHead et head rendent null pour un objet absent', async () => {
    const key = incomingKey(id());
    expect(await ready().storage.readHead(key, 8)).toBeNull();
    expect(await ready().storage.head(key)).toBeNull();
  });

  it('copy place l’objet en quarantaine sans retirer la source', async () => {
    const from = incomingKey(id());
    const to = quarantineKey(id());
    const { url, headers } = await signed(from);
    await put(url, headers, PNG);
    const object = await ready().storage.head(from);
    await ready().storage.copy(from, to, object?.etag);
    expect(await ready().storage.head(from)).toMatchObject({ size: PNG.length });
    expect(await ready().storage.head(to)).toMatchObject({ size: PNG.length });
    const { config, admin } = ready().s3;
    const body = await admin.send(new GetObjectCommand({ Bucket: config.bucket, Key: to }));
    const bytes = await body.Body?.transformToByteArray();
    expect(Buffer.from(bytes ?? []).equals(PNG)).toBe(true);
  });

  it('ETag : un objet remplacé depuis sa vérification n’est ni lu ni copié', async () => {
    const from = incomingKey(id());
    const to = quarantineKey(id());
    const { config, admin } = ready().s3;
    await admin.send(new PutObjectCommand({ Bucket: config.bucket, Key: from, Body: PNG }));
    const checked = await ready().storage.head(from);
    expect(checked?.etag).not.toBe('');
    expect(await ready().storage.readHead(from, 8, checked?.etag)).toEqual(
      Uint8Array.from(PNG.subarray(0, 8)),
    );
    await admin.send(
      new PutObjectCommand({ Bucket: config.bucket, Key: from, Body: Buffer.from('autre') }),
    );
    await expect(ready().storage.readHead(from, 8, checked?.etag)).rejects.toBeInstanceOf(
      StorageChangedError,
    );
    await expect(ready().storage.copy(from, to, checked?.etag)).rejects.toBeInstanceOf(
      StorageChangedError,
    );
    expect(await ready().storage.head(to)).toBeNull();
  });

  it('remove supprime, et ne lève pas sur un objet absent', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    await put(url, headers, PNG);
    await ready().storage.remove(key);
    expect(await ready().storage.head(key)).toBeNull();
    await expect(ready().storage.remove(key)).resolves.toBeUndefined();
  });
});
