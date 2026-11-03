import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanKey,
  DocumentStorage,
  exportKey,
  incomingKey,
  quarantineKey,
  StorageChangedError,
} from '../src/index.js';
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
    // Premier chiffre toujours changé : le remplacer par « 0 » laissait intacte une signature
    // commençant déjà par 0 (1 cas sur 16).
    const altered = new URL(url);
    const signature = altered.searchParams.get('X-Amz-Signature') ?? '';
    altered.searchParams.set(
      'X-Amz-Signature',
      `${signature.startsWith('0') ? '1' : '0'}${signature.slice(1)}`,
    );
    const res = await put(altered.toString(), headers, PNG);
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

describe('lecture complète et écriture sous clean/ (lot 1.9b)', () => {
  it('read rend l’objet entier ; ETag périmé : StorageChangedError ; absent : null', async () => {
    const key = incomingKey(id());
    const { url, headers } = await signed(key);
    await put(url, headers, PNG);
    const stored = await ready().storage.head(key);
    expect(Buffer.from((await ready().storage.read(key, PNG.length, stored?.etag)) ?? [])).toEqual(
      PNG,
    );
    await expect(ready().storage.read(key, PNG.length, '"autre"')).rejects.toBeInstanceOf(
      StorageChangedError,
    );
    await expect(ready().storage.read(key, PNG.length - 1)).rejects.toThrow(/borne/);
    expect(await ready().storage.read(quarantineKey(id()), 10)).toBeNull();
  });

  it('put écrit sous clean/ avec son type ; contenu relu à l’identique', async () => {
    const key = cleanKey(id());
    await ready().storage.put(key, PNG, 'image/png');
    const { config, admin } = ready().s3;
    const out = await admin.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    expect(out.ContentType).toBe('image/png');
    expect(Buffer.from((await out.Body?.transformToByteArray()) ?? [])).toEqual(PNG);
  });
});

// Lecture (lot 1.9ca, EX-110 n° 6) : aucune URL sans signature valide, ni au-delà de son échéance (CP-22).
describe('lecture par GET présigné (CP-22)', () => {
  const stored = async (): Promise<string> => {
    const key = cleanKey(id());
    await ready().storage.put(key, PNG, 'image/png');
    return key;
  };
  const readUrl = (key: string, signingDate?: Date) =>
    ready().storage.presignGet({
      key,
      contentType: 'image/png',
      expiresInSeconds: 300,
      ...(signingDate === undefined ? {} : { signingDate }),
    });

  it('sert les octets, en téléchargement, avec le type imposé et sans cache', async () => {
    const key = await stored();
    const res = await fetch((await readUrl(key)).url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBe('attachment');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it('refuse la requête sans signature', async () => {
    const key = await stored();
    const url = new URL((await readUrl(key)).url);
    expect((await fetch(`${url.origin}${url.pathname}`)).status).toBe(403);
  });

  it('refuse une signature altérée', async () => {
    const url = new URL((await readUrl(await stored())).url);
    const signature = url.searchParams.get('X-Amz-Signature') ?? '';
    url.searchParams.set(
      'X-Amz-Signature',
      `${signature.startsWith('0') ? '1' : '0'}${signature.slice(1)}`,
    );
    const res = await fetch(url);
    expect(res.status).toBe(403);
    expect(Buffer.from(await res.arrayBuffer()).includes(PNG)).toBe(false);
  });

  it('refuse un type de réponse ou une disposition modifiés', async () => {
    const key = await stored();
    for (const [name, value] of [
      ['response-content-type', 'text/html'],
      ['response-content-disposition', 'inline'],
    ] as const) {
      const url = new URL((await readUrl(key)).url);
      url.searchParams.set(name, value);
      expect((await fetch(url)).status).toBe(403);
    }
  });

  it('refuse une URL signée il y a plus de 5 minutes', async () => {
    const key = await stored();
    const { url, expiresAt } = await readUrl(key, new Date(Date.now() - 301_000));
    expect(expiresAt.getTime()).toBeLessThan(Date.now());
    expect((await fetch(url)).status).toBe(403);
  });
});

// Archives d'export (lot 1.16bb, D2 et D4) : écrites sous exports/, servies par URL signée seulement.
describe('archives d’export sous exports/', () => {
  it('putExport puis GET présigné : JSON en pièce jointe, sans cache ; remove l’efface', async () => {
    const key = exportKey(id());
    const body = Buffer.from(JSON.stringify({ formatVersion: 1, account: { status: 'active' } }));
    await ready().storage.putExport(key, body);
    const { config, admin } = ready().s3;
    const stored = await admin.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    expect(stored.ContentType).toBe('application/json');
    expect(stored.CacheControl).toBe('no-store');

    const { url } = await ready().storage.presignGet({
      key,
      contentType: 'application/json',
      expiresInSeconds: 300,
    });
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('content-disposition')).toBe('attachment');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(body);
    const parsed = new URL(url);
    expect((await fetch(`${parsed.origin}${parsed.pathname}`)).status).toBe(403);

    const listed = await ready().storage.list('exports/', {
      olderThan: new Date(Date.now() + 60_000),
      limit: 100,
    });
    expect(listed.objects.map((o) => o.key)).toContain(key);
    await ready().storage.remove(key);
    expect(await ready().storage.head(key)).toBeNull();
  });
});
