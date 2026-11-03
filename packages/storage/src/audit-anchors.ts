import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { preconditionFailed, StorageError, storageError, type StorageConfig } from './storage.js';

// Ancres du journal d'audit (lot 1.16a, D-060) : la tête de la chaîne (position, hachage) copiée hors
// de la base, dans un bucket verrouillé en mode COMPLIANCE. Ni l'application ni un administrateur de
// la base ne peut réécrire une ancre ; le worker vérifie la chaîne contre la plus récente.

export interface AuditAnchorConfig extends StorageConfig {
  /** Rétention du verrou en jours ; 0 : aucun en-tête de verrou (bucket sans Object Lock). */
  readonly lockDays: number;
}

export interface AuditAnchor {
  readonly position: number;
  /** SHA-256 de l'entrée ancrée, en hexadécimal minuscule. */
  readonly hash: string;
}

const PREFIX = 'anchors/';
const DIGITS = 20;
/** Complément de la position : la plus récente vient en premier dans l'ordre des clés. */
const CEILING = 10n ** BigInt(DIGITS) - 1n;
const KEY = /^anchors\/\d{20}$/;
const HASH = /^[0-9a-f]{64}$/;
/** Une ancre fait moins de 200 octets ; au-delà, elle n'est pas lue. */
const MAX_ANCHOR_BYTES = 1_024;
const DAY_MS = 86_400_000;

function assertPosition(position: number): void {
  if (!Number.isSafeInteger(position) || position < 1) {
    throw new RangeError("ancre d'audit : position hors bornes");
  }
}

/** Clé d'une ancre : `anchors/` suivi du complément de la position sur 20 chiffres. */
export function anchorKey(position: number): string {
  assertPosition(position);
  return `${PREFIX}${(CEILING - BigInt(position)).toString().padStart(DIGITS, '0')}`;
}

function positionOf(key: string): number {
  return Number(CEILING - BigInt(key.slice(PREFIX.length)));
}

/** Contenu relu : exactement `{ position, hash, anchoredAt }`, conforme à sa clé. */
function parseAnchor(key: string, text: string): AuditAnchor {
  const unreadable = new StorageError("ancre d'audit illisible");
  if (text.length > MAX_ANCHOR_BYTES) throw unreadable;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unreadable;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw unreadable;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'anchoredAt,hash,position') throw unreadable;
  const { position, hash, anchoredAt } = record;
  if (
    typeof position !== 'number' ||
    position !== positionOf(key) ||
    typeof hash !== 'string' ||
    !HASH.test(hash) ||
    typeof anchoredAt !== 'string' ||
    Number.isNaN(Date.parse(anchoredAt))
  ) {
    throw unreadable;
  }
  return { position, hash };
}

export class AuditAnchorStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly lockDays: number;

  constructor(config: AuditAnchorConfig) {
    if (!Number.isInteger(config.lockDays) || config.lockDays < 0 || config.lockDays > 3_650) {
      throw new RangeError("ancre d'audit : rétention de 0 à 3 650 jours");
    }
    this.bucket = config.bucket;
    this.lockDays = config.lockDays;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
      maxAttempts: 2,
      requestHandler: {
        connectionTimeout: 5_000,
        requestTimeout: 15_000,
        throwOnRequestTimeout: true,
      },
    });
  }

  /** Écrit l'ancre ; `exists` si cette position est déjà ancrée (jamais d'écrasement). */
  async put(anchor: AuditAnchor, now: Date = new Date()): Promise<'written' | 'exists'> {
    const key = anchorKey(anchor.position);
    if (!HASH.test(anchor.hash)) throw new RangeError("ancre d'audit : hachage hors format");
    const locked = this.lockDays > 0;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: JSON.stringify({
            position: anchor.position,
            hash: anchor.hash,
            anchoredAt: now.toISOString(),
          }),
          ContentType: 'application/json',
          IfNoneMatch: '*',
          ObjectLockMode: locked ? 'COMPLIANCE' : undefined,
          ObjectLockRetainUntilDate: locked
            ? new Date(now.getTime() + this.lockDays * DAY_MS)
            : undefined,
        }),
      );
    } catch (error) {
      if (preconditionFailed(error)) return 'exists';
      throw storageError('PUT', error);
    }
    return 'written';
  }

  /** Ancre la plus avancée, ou `null` s'il n'y en a aucune. Une ancre illisible lève une erreur. */
  async latest(): Promise<AuditAnchor | null> {
    let key: string | undefined;
    try {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: PREFIX, MaxKeys: 1 }),
      );
      key = page.Contents?.[0]?.Key;
    } catch (error) {
      throw storageError('LIST', error);
    }
    if (key === undefined) return null;
    if (!KEY.test(key) || positionOf(key) < 1) {
      throw new StorageError("ancre d'audit illisible");
    }
    let text: string;
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      text = (await object.Body?.transformToString()) ?? '';
    } catch (error) {
      throw storageError('GET', error);
    }
    return parseAnchor(key, text);
  }

  destroy(): void {
    this.client.destroy();
  }
}
