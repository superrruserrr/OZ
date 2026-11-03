import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  claimDataExport,
  createDbClient,
  expireDataExport,
  failDataExport,
  finishDataExport,
  listDueDataExports,
  personalDataExport,
  type PrismaClient,
} from '@oz/db';
import { DocumentStorage } from '@oz/storage';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDataExport,
  maintainDataExports,
  type DataExportDependencies,
} from '../src/data-export.js';

// Export des données personnelles de bout en bout (lot 1.16bb, tâches 3 et 4) : PostgreSQL migré,
// le worker sous le rôle `oz_worker`, archives dans SeaweedFS.

const POSTGRES_IMAGE = 'postgres:16.15-alpine';
const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.50';
const run = promisify(execFile);
const MIGRATE = new URL('../../../packages/db/dist/cli/migrate.js', import.meta.url).pathname;
const BUCKET = 'oz-documents';
const S3_ACCESS = 'oz-test-access';
const S3_SECRET = 'oz-test-secret';
const KEY = 'k'.repeat(40);

let postgres: StartedPostgreSqlContainer;
let s3: StartedTestContainer;
let admin: PrismaClient;
let worker: PrismaClient;
let client: S3Client;
let storage: DocumentStorage;
const logs: { level: string; event: string; fields: Record<string, unknown> }[] = [];
const mails: string[] = [];

const log =
  (level: string) =>
  (fields: Record<string, unknown>, event: string): void => {
    logs.push({ level, event, fields });
  };
const logger = { info: log('info'), warn: log('warn'), error: log('error') };

const deps = (): DataExportDependencies => ({
  claim: (id) => claimDataExport(worker, id),
  build: (userId) => personalDataExport(worker, userId, KEY),
  finish: (id) => finishDataExport(worker, id),
  fail: (id, reason) => failDataExport(worker, id, reason),
  storage,
  notify: (to) => {
    mails.push(to);
    return Promise.resolve();
  },
  logger,
});

const account = async (email: string): Promise<{ userId: string; requestId: string }> => {
  const [row] = await admin.$queryRawUnsafe<{ user_id: string; id: string }[]>(
    `WITH u AS (INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id)
     INSERT INTO data_export_requests (user_id) SELECT id FROM u RETURNING id::text, user_id::text`,
    email,
  );
  if (row === undefined) throw new Error('demande non créée');
  return { userId: row.user_id, requestId: row.id };
};
const statusOf = async (requestId: string): Promise<string | undefined> => {
  const [row] = await admin.$queryRawUnsafe<{ status: string }[]>(
    'SELECT status FROM data_export_requests WHERE id = $1::uuid',
    requestId,
  );
  return row?.status;
};
const stored = async (key: string): Promise<string | null> => {
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return (await out.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
};

beforeAll(async () => {
  [postgres, s3] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new GenericContainer(SEAWEEDFS_IMAGE)
      .withEntrypoint(['/bin/sh', '-c'])
      .withCommand([
        `printf '{"identities":[{"name":"t","credentials":[{"accessKey":"${S3_ACCESS}","secretKey":"${S3_SECRET}"}],"actions":["Admin","Read","Write","List"]}]}' > /tmp/s3.json && exec weed server -dir=/data -ip.bind=0.0.0.0 -s3 -s3.port=8333 -s3.config=/tmp/s3.json`,
      ])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
  ]);
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
  await admin.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO oz_worker_test');
  const workerUrl = new URL(superuser);
  workerUrl.username = 'oz_worker_test';
  workerUrl.password = 'oz_worker_test';
  worker = createDbClient(workerUrl.toString());

  const endpoint = `http://${s3.getHost()}:${String(s3.getMappedPort(8333))}`;
  client = new S3Client({
    endpoint,
    region: 'fr-par',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS, secretAccessKey: S3_SECRET },
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
      break;
    } catch (error) {
      if (attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  storage = new DocumentStorage({
    endpoint,
    region: 'fr-par',
    bucket: BUCKET,
    accessKey: S3_ACCESS,
    secretKey: S3_SECRET,
  });
}, 240_000);

afterAll(async () => {
  storage.destroy();
  client.destroy();
  await Promise.allSettled([worker.$disconnect(), admin.$disconnect()]);
  await Promise.allSettled([postgres.stop(), s3.stop()]);
});

describe('production de l’archive', () => {
  it('pending → ready : l’objet est le JSON de la base ; email unique ; rejeu sans effet', async () => {
    const { userId, requestId } = await account('archive@example.test');
    expect(await buildDataExport(deps(), requestId, { lastAttempt: false })).toBe('ready');
    expect(await statusOf(requestId)).toBe('ready');
    const body = await stored(`exports/${requestId}.json`);
    // Relu après coup : seule l'entrée `data.export.ready`, écrite après l'assemblage, s'y ajoute.
    const expected = (await personalDataExport(worker, userId, KEY)) as unknown as {
      auditLog: { action: string }[];
    };
    // `generatedAt` diffère d'une lecture à l'autre.
    const archive = JSON.parse(body ?? 'null') as { generatedAt: string };
    expect(archive).toEqual({
      ...expected,
      generatedAt: archive.generatedAt,
      auditLog: expected.auditLog.filter((entry) => entry.action !== 'data.export.ready'),
    });
    expect(mails).toEqual(['archive@example.test']);

    expect(await buildDataExport(deps(), requestId, { lastAttempt: true })).toBe('skipped');
    expect(mails).toHaveLength(1);
    const text = JSON.stringify(logs);
    expect(text).not.toContain('archive@example.test');
    expect(text).not.toContain(userId);
  });

  it('compte supprimé entre-temps : `failed`, aucun objet', async () => {
    const { userId, requestId } = await account('parti@example.test');
    await admin.$executeRawUnsafe(
      'UPDATE users SET deleted_at = now() WHERE id = $1::uuid',
      userId,
    );
    // Refusée dès la prise par la base (`account_gone`) : rien n'est assemblé.
    expect(await buildDataExport(deps(), requestId, { lastAttempt: false })).toBe('skipped');
    expect(await statusOf(requestId)).toBe('failed');
    expect(await stored(`exports/${requestId}.json`)).toBeNull();
  });
});

describe('maintenance', () => {
  it('archive échue : objet supprimé, demande `expired`', async () => {
    const { requestId } = await account('echue@example.test');
    await buildDataExport(deps(), requestId, { lastAttempt: false });
    await admin.$executeRawUnsafe(
      `UPDATE data_export_requests SET ready_at = now() - interval '8 days',
         expires_at = now() - interval '1 minute' WHERE id = $1::uuid`,
      requestId,
    );
    const added: string[] = [];
    const counts = await maintainDataExports({
      listDue: (limit) => listDueDataExports(worker, limit),
      expire: (id) => expireDataExport(worker, id),
      fail: (id, reason) => failDataExport(worker, id, reason),
      storage,
      queue: {
        getJob: () => Promise.resolve(undefined),
        add: (_name, data) => {
          added.push(data.requestId);
          return Promise.resolve();
        },
      },
      logger,
    });
    expect(counts.expired).toBe(1);
    expect(await statusOf(requestId)).toBe('expired');
    expect(await stored(`exports/${requestId}.json`)).toBeNull();
  });
});
