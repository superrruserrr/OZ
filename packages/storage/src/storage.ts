import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertStorageKey } from './keys.js';

export interface StorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
}

export interface PresignPutInput {
  readonly key: string;
  readonly contentType: string;
  readonly contentLength: number;
  /** Empreinte SHA-256 en hexadécimal, déclarée par le client et signée dans l'envoi (D1). */
  readonly sha256: string;
  readonly expiresInSeconds: number;
}

export interface PresignGetInput {
  /** Toujours `clean/<uuid>` : seul un fichier analysé et sain est servi (CP-21). */
  readonly key: string;
  /** Type réel vérifié, imposé à la réponse du stockage. */
  readonly contentType: string;
  /** 300 s au plus (EX-110 n° 6). */
  readonly expiresInSeconds: number;
  /** Date de signature imposée : tests d'expiration seulement (CP-22). */
  readonly signingDate?: Date;
}

export interface PresignedGet {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface PresignedPut {
  readonly url: string;
  /** En-têtes signés : le client les renvoie tels quels, sinon le stockage refuse l'envoi. */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

/** Plus que les octets de tête qu'exige la reconnaissance du type réel (4 100). */
const MAX_HEAD_BYTES = 1_048_576;
/** 50 Mo : borne du dépôt (contrat, base, signature). */
const MAX_OBJECT_BYTES = 52_428_800;
const SIGNED_HEADERS = ['content-type', 'content-length', 'x-amz-checksum-sha256'];
const SHA256_HEX = /^[0-9a-f]{64}$/i;
/** Lecture : 5 minutes au plus (EX-110 n° 6, CP-22). */
const MAX_READ_SECONDS = 300;

const preconditionFailed = (error: unknown): boolean =>
  error instanceof S3ServiceException &&
  (error.name === 'PreconditionFailed' || error.$metadata.httpStatusCode === 412);

const notFound = (error: unknown): boolean =>
  error instanceof S3ServiceException &&
  (error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    error.$metadata.httpStatusCode === 404);

/**
 * Stockage des documents (lot 1.9a, TD-010) : dépôt direct par URL signée, l'API ne porte jamais le
 * binaire (EX-110 n° 1). Seules les clés `incoming/<uuid>`, `quarantine/<uuid>` et `clean/<uuid>` sont
 * admises ; le worker d'analyse (lot 1.9b) lit la quarantaine et écrit sous `clean/`.
 */
export class DocumentStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      // Chemin plutôt que sous-domaine : identique sur Scaleway et SeaweedFS.
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
      // Aucune somme CRC32 ajoutée d'office : seule la SHA-256 déclarée est signée.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
      // Aucune requête sans fin : connexion en 5 s, réponse en 15 s (une copie de 50 Mo y tient
      // largement), sinon erreur ; deux essais au plus, soit 40 s dans le pire des cas.
      requestHandler: {
        connectionTimeout: 5_000,
        requestTimeout: 15_000,
        throwOnRequestTimeout: true,
      },
    });
  }

  async presignPut(input: PresignPutInput): Promise<PresignedPut> {
    assertStorageKey(input.key);
    if (!Number.isInteger(input.contentLength) || input.contentLength < 1) {
      throw new RangeError('taille déclarée invalide');
    }
    if (!SHA256_HEX.test(input.sha256)) throw new RangeError('empreinte SHA-256 invalide');
    if (input.contentType.length === 0) throw new RangeError('type de contenu requis');
    if (
      !Number.isInteger(input.expiresInSeconds) ||
      input.expiresInSeconds < 1 ||
      input.expiresInSeconds > 3600
    ) {
      throw new RangeError('durée de validité invalide');
    }
    const checksum = Buffer.from(input.sha256, 'hex').toString('base64');
    // Signature datée à la seconde, au plus tôt maintenant : l'échéance annoncée n'est jamais tardive.
    const issued = Math.floor(Date.now() / 1000) * 1000;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
        ChecksumSHA256: checksum,
      }),
      {
        expiresIn: input.expiresInSeconds,
        // En-têtes et non paramètres d'URL : le stockage les compare à la requête reçue.
        signableHeaders: new Set(SIGNED_HEADERS),
        unhoistableHeaders: new Set(SIGNED_HEADERS),
      },
    );
    return {
      url,
      headers: {
        'content-type': input.contentType,
        'content-length': String(input.contentLength),
        'x-amz-checksum-sha256': checksum,
      },
      expiresAt: new Date(issued + input.expiresInSeconds * 1000),
    };
  }

  /**
   * URL de lecture d'un fichier sain (lot 1.9ca). Type, téléchargement (`attachment`) et absence de
   * cache sont signés dans l'URL : le stockage refuse toute variante, et le navigateur n'interprète
   * jamais le fichier comme une page.
   */
  async presignGet(input: PresignGetInput): Promise<PresignedGet> {
    assertStorageKey(input.key);
    if (!input.key.startsWith('clean/')) throw new TypeError('lecture réservée aux clés clean/');
    if (input.contentType.length === 0) throw new RangeError('type de contenu requis');
    if (
      !Number.isInteger(input.expiresInSeconds) ||
      input.expiresInSeconds < 1 ||
      input.expiresInSeconds > MAX_READ_SECONDS
    ) {
      throw new RangeError('durée de validité invalide');
    }
    // Signature datée à la seconde, au plus tôt maintenant : l'échéance annoncée n'est jamais tardive.
    const issued = Math.floor((input.signingDate ?? new Date()).getTime() / 1000) * 1000;
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ResponseContentType: input.contentType,
        ResponseContentDisposition: 'attachment',
        ResponseCacheControl: 'no-store',
      }),
      { expiresIn: input.expiresInSeconds, signingDate: new Date(issued) },
    );
    return { url, expiresAt: new Date(issued + input.expiresInSeconds * 1000) };
  }

  /**
   * Taille réelle et ETag de l'objet, ou `null` s'il n'existe pas. L'ETag fige la version vérifiée :
   * lecture et copie qui suivent le reçoivent et échouent si l'objet a changé entre-temps.
   */
  async head(key: string): Promise<StoredObject | null> {
    assertStorageKey(key);
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: out.ContentLength ?? 0, etag: out.ETag ?? '' };
    } catch (error) {
      if (notFound(error)) return null;
      throw storageError('HEAD', error);
    }
  }

  /**
   * Les `bytes` premiers octets seulement (`Range`), ou `null` si l'objet n'existe pas. Avec `etag` :
   * `StorageChangedError` si l'objet n'est plus celui-là.
   */
  async readHead(key: string, bytes: number, etag?: string): Promise<Uint8Array | null> {
    assertStorageKey(key);
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_HEAD_BYTES) {
      throw new RangeError('nombre d’octets invalide');
    }
    try {
      const out = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=0-${String(bytes - 1)}`,
          IfMatch: etag,
        }),
      );
      const body = await out.Body?.transformToByteArray();
      return body === undefined ? new Uint8Array() : body.subarray(0, bytes);
    } catch (error) {
      if (notFound(error)) return null;
      if (preconditionFailed(error)) throw new StorageChangedError();
      throw storageError('GET', error);
    }
  }

  /**
   * Objet entier, au plus `maxBytes` octets, ou `null` s'il n'existe pas. Une taille annoncée au-delà
   * est refusée avant toute lecture du corps. Avec `etag` : `StorageChangedError` si l'objet a changé.
   */
  async read(key: string, maxBytes: number, etag?: string): Promise<Uint8Array | null> {
    assertStorageKey(key);
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_OBJECT_BYTES) {
      throw new RangeError('borne de lecture invalide');
    }
    let body: Uint8Array | undefined;
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, IfMatch: etag }),
      );
      if ((out.ContentLength ?? 0) > maxBytes) {
        // Corps non lu : le flux est détruit pour libérer la connexion.
        (out.Body as { destroy?: () => void } | undefined)?.destroy?.();
        throw new RangeError('objet au-delà de la borne de lecture');
      }
      body = await out.Body?.transformToByteArray();
    } catch (error) {
      if (error instanceof RangeError) throw error;
      if (notFound(error)) return null;
      if (preconditionFailed(error)) throw new StorageChangedError();
      throw storageError('GET', error);
    }
    if (body === undefined) return new Uint8Array();
    if (body.byteLength > maxBytes) throw new RangeError('objet au-delà de la borne de lecture');
    return body;
  }

  /**
   * Écrit un fichier analysé sous `clean/` (seul préfixe accepté), avec son empreinte SHA-256 : le
   * stockage refuse un contenu altéré en route.
   */
  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertStorageKey(key);
    if (!key.startsWith('clean/')) throw new TypeError('écriture réservée aux clés clean/');
    if (body.byteLength < 1 || body.byteLength > MAX_OBJECT_BYTES) {
      throw new RangeError('taille du contenu invalide');
    }
    if (contentType.length === 0) throw new RangeError('type de contenu requis');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.byteLength,
          ChecksumSHA256: createHash('sha256').update(body).digest('base64'),
        }),
      );
    } catch (error) {
      throw storageError('PUT', error);
    }
  }

  /**
   * Copie sans supprimer la source : la suppression vient après l'enregistrement, pour qu'un échec
   * entre les deux laisse le dépôt intact (D2). Avec `etag` : `StorageChangedError` si la source a
   * changé depuis sa vérification.
   */
  async copy(from: string, to: string, etag?: string): Promise<void> {
    assertStorageKey(from);
    assertStorageKey(to);
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: to,
          CopySource: `${this.bucket}/${from}`,
          CopySourceIfMatch: etag,
        }),
      );
    } catch (error) {
      if (preconditionFailed(error)) throw new StorageChangedError();
      throw storageError('COPY', error);
    }
  }

  /** Suppression idempotente : un objet absent n'est pas une erreur. */
  async remove(key: string): Promise<void> {
    assertStorageKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (notFound(error)) return;
      throw storageError('DELETE', error);
    }
  }

  destroy(): void {
    this.client.destroy();
  }
}

export class StorageError extends Error {
  override readonly name: string = 'StorageError';
}

/** L'objet n'est plus la version vérifiée (ETag différent) : rien n'a été lu ni copié. */
export class StorageChangedError extends StorageError {
  override readonly name = 'StorageChangedError';

  constructor() {
    super('objet modifié depuis sa vérification');
  }
}

export interface StoredObject {
  readonly size: number;
  /** Version de l'objet, à repasser à `readHead` et `copy`. */
  readonly etag: string;
}

/** Erreur sans la requête signée ni les identifiants : opération et code seulement. */
function storageError(operation: string, error: unknown): StorageError {
  const code =
    error instanceof S3ServiceException
      ? `${error.name} (${String(error.$metadata.httpStatusCode ?? '?')})`
      : error instanceof Error
        ? error.name
        : 'inconnue';
  return new StorageError(`stockage indisponible : ${operation} a échoué, ${code}`);
}
