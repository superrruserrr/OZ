import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadWorkerConfig } from '@oz/config';
import { createDbClient, type PrismaClient } from '@oz/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClamavClient } from '../src/clamav.js';
import { DOCUMENT_SCAN_JOB, DOCUMENT_SCAN_QUEUE } from '../src/processor.js';
import { serve, type SignalTarget, type WorkerHandle } from '../src/worker.js';
import { buildPdf, eicar } from './fixtures.js';

// Analyse de bout en bout (lot 1.9b, tâche 8, EX-110 n° 2 à 5) sur la pile réelle : PostgreSQL migré,
// Redis, SeaweedFS (S3) et ClamAV. Le worker démarre comme en production, sous le rôle `oz_worker`.

// Mêmes images que infra/docker/compose.dev.yml.
const POSTGRES_IMAGE = 'postgres:16.15-alpine';
const REDIS_IMAGE = 'redis:7.4.11-alpine';
const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.50';
const CLAMAV_IMAGE = 'clamav/clamav:1.5.4-debian13-slim';

const run = promisify(execFile);
const MIGRATE = new URL('../../../packages/db/dist/cli/migrate.js', import.meta.url).pathname;
const BUCKET = 'oz-documents';
const S3_ACCESS = 'oz-test-access';
const S3_SECRET = 'oz-test-secret';
const PAYLOAD = '<script>alert("oz")</script>';

let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let s3: StartedTestContainer;
let clamd: StartedTestContainer;
let admin: PrismaClient;
let bucket: S3Client;
let queue: Queue;
let worker: WorkerHandle;
let ownerId: string;
let playerId: string;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Dépose un document `pending` comme la réception (lot 1.9a) et le met en file comme l'API. */
async function deposit(
  bytes: Buffer,
  mime: string,
  options: { attempts?: number; skipUpload?: boolean } = {},
): Promise<string> {
  const [row] = await admin.$queryRawUnsafe<{ id: string }[]>(
    `WITH n AS (SELECT oz_uuid_v7() AS id)
     INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256, retention_until)
     SELECT n.id, 'identity_document', $1::uuid, $2::uuid, 'quarantine/' || n.id, $3, $4, $5, now() + interval '90 days'
     FROM n RETURNING id::text`,
    playerId,
    ownerId,
    mime,
    bytes.byteLength,
    sha256(bytes),
  );
  if (row === undefined) throw new Error('document non créé');
  if (options.skipUpload !== true) {
    await bucket.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `quarantine/${row.id}`,
        Body: bytes,
        ContentType: mime,
      }),
    );
  }
  await queue.add(
    DOCUMENT_SCAN_JOB,
    { documentId: row.id },
    { jobId: row.id, attempts: options.attempts ?? 5, backoff: { type: 'fixed', delay: 200 } },
  );
  return row.id;
}

interface Verdict {
  av_status: string;
  storage_key: string;
  rejection_reason: string | null;
  width: number | null;
  page_count: number | null;
  size_bytes: number;
}

/** Attend le verdict (le document quitte `pending`). */
async function verdict(id: string): Promise<Verdict> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const [row] = await admin.$queryRawUnsafe<Verdict[]>(
      `SELECT av_status::text, storage_key, rejection_reason, width, page_count, size_bytes::int
       FROM documents WHERE id = $1::uuid`,
      id,
    );
    if (row !== undefined && row.av_status !== 'pending') return row;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`aucun verdict pour ${id}`);
}

async function keys(id: string): Promise<string[]> {
  // La quarantaine est retirée juste après le verdict : laisser le temps à la suppression.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const listed = await bucket.send(new ListObjectsV2Command({ Bucket: BUCKET }));
  return (listed.Contents ?? [])
    .map((object) => object.Key ?? '')
    .filter((key) => key.endsWith(id));
}

async function object(key: string): Promise<Buffer> {
  const got = await bucket.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await (got.Body?.transformToByteArray() ?? Promise.resolve(new Uint8Array())));
}

const noSignals: SignalTarget = { once: () => undefined, exit: () => undefined };

beforeAll(async () => {
  [postgres, redis, s3, clamd] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new RedisContainer(REDIS_IMAGE).start(),
    new GenericContainer(SEAWEEDFS_IMAGE)
      .withEntrypoint(['/bin/sh', '-c'])
      .withCommand([
        `printf '{"identities":[{"name":"t","credentials":[{"accessKey":"${S3_ACCESS}","secretKey":"${S3_SECRET}"}],"actions":["Admin","Read","Write","List"]}]}' > /tmp/s3.json && exec weed server -dir=/data -ip.bind=0.0.0.0 -s3 -s3.port=8333 -s3.config=/tmp/s3.json`,
      ])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
    // Signatures embarquées dans l'image : aucune mise à jour réseau pendant le test.
    new GenericContainer(CLAMAV_IMAGE)
      .withEnvironment({
        CLAMAV_NO_FRESHCLAMD: 'true',
        // Mêmes limites que infra/docker/compose.dev.yml.
        CLAMD_CONF_StreamMaxLength: '50M',
        CLAMD_CONF_MaxFileSize: '50M',
        CLAMD_CONF_AlertExceedsMax: 'yes',
      })
      .withExposedPorts(3310)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(240_000)
      .start(),
  ]);

  // Rôles créés par Terraform en recette, avant les migrations.
  const superuser = postgres.getConnectionUri();
  admin = createDbClient(superuser);
  await admin.$executeRawUnsafe(
    `DO $$ BEGIN
       CREATE ROLE oz_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       CREATE ROLE oz_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
       CREATE ROLE oz_worker_test LOGIN PASSWORD 'oz_worker_test' NOSUPERUSER NOBYPASSRLS IN ROLE oz_worker;
     END $$`,
  );
  await run(process.execPath, [MIGRATE], { env: { ...process.env, DATABASE_URL: superuser } });
  // Privilège Scaleway `readonly` du worker.
  await admin.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO oz_worker_test');
  await admin.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO oz_worker_test');

  const [user] = await admin.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email) VALUES ('titulaire-pipeline@example.test') RETURNING id::text`,
  );
  ownerId = user?.id ?? '';
  const [player] = await admin.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
     VALUES ($1::uuid, 'Joueur', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared') RETURNING id::text`,
    ownerId,
  );
  playerId = player?.id ?? '';

  // Bucket : le maître SeaweedFS peut mettre quelques secondes à l'accepter.
  for (let attempt = 0; ; attempt += 1) {
    const result = await s3.exec([
      'sh',
      '-c',
      `echo "s3.bucket.create -name ${BUCKET}" | weed shell`,
    ]);
    const list = await s3.exec(['sh', '-c', 'echo s3.bucket.list | weed shell']);
    if (result.exitCode === 0 && list.output.includes(BUCKET)) break;
    if (attempt >= 30) throw new Error(`bucket ${BUCKET} non créé`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const endpoint = `http://${s3.getHost()}:${String(s3.getMappedPort(8333))}`;
  bucket = new S3Client({
    endpoint,
    region: 'fr-par',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS, secretAccessKey: S3_SECRET },
  });

  // clamd ouvre son port avant d'avoir chargé toutes les signatures : attendre sa réponse.
  const clamav = new ClamavClient({ host: clamd.getHost(), port: clamd.getMappedPort(3310) });
  for (let attempt = 0; !(await clamav.ping().catch(() => false)); attempt += 1) {
    if (attempt >= 120) throw new Error('clamd ne répond pas');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const workerUrl = new URL(superuser);
  workerUrl.username = 'oz_worker_test';
  workerUrl.password = 'oz_worker_test';
  const config = loadWorkerConfig({
    NODE_ENV: 'test',
    APP_ENV: 'local',
    LOG_LEVEL: 'silent',
    WORKER_DATABASE_URL: workerUrl.toString(),
    REDIS_URL: redis.getConnectionUrl(),
    S3_ENDPOINT: endpoint,
    S3_REGION: 'fr-par',
    S3_BUCKET: BUCKET,
    S3_ACCESS_KEY: S3_ACCESS,
    S3_SECRET_KEY: S3_SECRET,
    CLAMAV_HOST: clamd.getHost(),
    CLAMAV_PORT: String(clamd.getMappedPort(3310)),
  });
  queue = new Queue(DOCUMENT_SCAN_QUEUE, { connection: { url: redis.getConnectionUrl() } });
  worker = await serve(config, noSignals, 0);
}, 300_000);

afterAll(async () => {
  await worker.close();
  await queue.close();
  bucket.destroy();
  await admin.$disconnect();
  await Promise.all([postgres.stop(), redis.stop(), s3.stop(), clamd.stop()]);
});

describe('analyse de bout en bout (EX-110)', () => {
  it('PDF contenant la chaîne EICAR : `infected`, aucun objet ne subsiste', async () => {
    const id = await deposit(buildPdf(1, { content: eicar() }), 'application/pdf');
    expect(await verdict(id)).toMatchObject({ av_status: 'infected' });
    expect(await keys(id)).toEqual([]);
    const [audit] = await admin.$queryRawUnsafe<{ action: string; signature: string }[]>(
      `SELECT action, metadata->>'signature' AS signature FROM audit_log WHERE target_id = $1::uuid`,
      id,
    );
    expect(audit?.action).toBe('document.scan.infected');
    expect(audit?.signature).toMatch(/eicar/i);
  });

  it('PNG piégé (charge après la fin d’image) : `clean`, fichier ré-encodé sans la charge', async () => {
    const png = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#3a7' },
    })
      .png()
      .toBuffer();
    const trapped = Buffer.concat([png, Buffer.from(PAYLOAD)]);
    const id = await deposit(trapped, 'image/png');
    const result = await verdict(id);
    expect(result).toMatchObject({
      av_status: 'clean',
      storage_key: `clean/${id}`,
      width: 640,
      rejection_reason: null,
    });
    expect(await keys(id)).toEqual([`clean/${id}`]);
    const clean = await object(`clean/${id}`);
    expect(clean.byteLength).toBe(result.size_bytes);
    expect(clean.includes(PAYLOAD)).toBe(false);
    expect((await sharp(clean).metadata()).format).toBe('png');
  });

  it('JPEG piégé (commentaire, EXIF et GPS) : `clean`, métadonnées et charge retirées', async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#a37' },
    })
      .withMetadata({
        exif: {
          IFD0: { Artist: 'Personne Réelle', Copyright: PAYLOAD },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '4/1 3/1 0/1' },
        },
      })
      .jpeg()
      .toBuffer();
    const comment = Buffer.from(PAYLOAD);
    const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0, comment.length + 2]), comment]);
    const trapped = Buffer.concat([jpeg.subarray(0, 2), com, jpeg.subarray(2)]);
    expect((await sharp(trapped).metadata()).exif).toBeDefined();
    const id = await deposit(trapped, 'image/jpeg');
    expect(await verdict(id)).toMatchObject({ av_status: 'clean' });
    const clean = await object(`clean/${id}`);
    expect(clean.includes(PAYLOAD)).toBe(false);
    expect(clean.includes('Personne')).toBe(false);
    const meta = await sharp(clean).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it('PDF sain de 3 pages : `clean`, copié tel quel', async () => {
    const pdf = buildPdf(3);
    const id = await deposit(pdf, 'application/pdf');
    expect(await verdict(id)).toMatchObject({ av_status: 'clean', page_count: 3 });
    expect(sha256(await object(`clean/${id}`))).toBe(sha256(pdf));
    expect(await keys(id)).toEqual([`clean/${id}`]);
  });

  it('image trop petite : `rejected/dimensions`, aucun objet ne subsiste', async () => {
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const id = await deposit(tiny, 'image/png');
    expect(await verdict(id)).toMatchObject({
      av_status: 'rejected',
      rejection_reason: 'dimensions',
    });
    expect(await keys(id)).toEqual([]);
  });

  it('worker actif et Redis connecté : sain', () => {
    expect(worker.healthy()).toBe(true);
  });

  it('fichier introuvable jusqu’au dernier essai : verdict `error`, jamais accessible', async () => {
    const id = await deposit(buildPdf(1), 'application/pdf', { attempts: 2, skipUpload: true });
    expect(await verdict(id)).toMatchObject({ av_status: 'error' });
  });
});
