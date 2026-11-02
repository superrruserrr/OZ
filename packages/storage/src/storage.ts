import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
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

export interface PresignedPut {
  readonly url: string;
  /** En-têtes signés : le client les renvoie tels quels, sinon le stockage refuse l'envoi. */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

/** Plus que les octets de tête qu'exige la reconnaissance du type réel (4 100). */
const MAX_HEAD_BYTES = 1_048_576;
const SIGNED_HEADERS = ['content-type', 'content-length', 'x-amz-checksum-sha256'];
const SHA256_HEX = /^[0-9a-f]{64}$/i;

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
 * binaire (EX-110 n° 1). Seules les clés `incoming/<uuid>` et `quarantine/<uuid>` sont admises.
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
