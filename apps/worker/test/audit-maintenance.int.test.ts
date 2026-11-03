import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CreateBucketCommand,
  PutObjectLockConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createDbClient, type PrismaClient } from '@oz/db';
import { AuditAnchorStore } from '@oz/storage';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAuditDependencies,
  createAuditHandlers,
  type AuditHandlers,
} from '../src/audit-maintenance.js';

// Journal d'audit de bout en bout (lot 1.16a, tâche 3, CP-23, D-057, D-060) : PostgreSQL migré, le
// worker sous le rôle `oz_worker`, ancres dans un bucket SeaweedFS verrouillé en COMPLIANCE.

const POSTGRES_IMAGE = 'postgres:16.15-alpine';
const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.50';
const run = promisify(execFile);
const MIGRATE = new URL('../../../packages/db/dist/cli/migrate.js', import.meta.url).pathname;
const BUCKET = 'oz-audit-anchors';
const S3_ACCESS = 'oz-test-access';
const S3_SECRET = 'oz-test-secret';

let postgres: StartedPostgreSqlContainer;
let s3: StartedTestContainer;
let admin: PrismaClient;
let worker: PrismaClient;
let anchors: AuditAnchorStore;
let handlers: AuditHandlers;
const logs: { level: string; event: string; fields: Record<string, unknown> }[] = [];

const log =
  (level: string) =>
  (fields: Record<string, unknown>, event: string): void => {
    logs.push({ level, event, fields });
  };

const record = (reason = 'motif de test') =>
  admin.$executeRawUnsafe(
    `INSERT INTO audit_log (action, target_type, target_id, reason)
     VALUES ('kyc.case.transitioned', 'kyc_case', oz_uuid_v7(), $1)`,
    reason,
  );

/** Altération directe, comme un administrateur de la base : déclencheurs coupés. */
const tamper = (sql: string) =>
  admin.$transaction([
    admin.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
    admin.$executeRawUnsafe(sql),
  ]);

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
  await admin.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO oz_worker_test');
  await admin.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO oz_worker_test');
  const workerUrl = new URL(superuser);
  workerUrl.username = 'oz_worker_test';
  workerUrl.password = 'oz_worker_test';
  worker = createDbClient(workerUrl.toString());

  const endpoint = `http://${s3.getHost()}:${String(s3.getMappedPort(8333))}`;
  const client = new S3Client({
    endpoint,
    region: 'fr-par',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS, secretAccessKey: S3_SECRET },
  });
  // Le service S3 répond quelques secondes après l'ouverture du port.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.send(
        new CreateBucketCommand({ Bucket: BUCKET, ObjectLockEnabledForBucket: true }),
      );
      break;
    } catch (error) {
      if (attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await client.send(
    new PutObjectLockConfigurationCommand({
      Bucket: BUCKET,
      ObjectLockConfiguration: {
        ObjectLockEnabled: 'Enabled',
        Rule: { DefaultRetention: { Mode: 'COMPLIANCE', Days: 1 } },
      },
    }),
  );
  client.destroy();
  anchors = new AuditAnchorStore({
    endpoint,
    region: 'fr-par',
    bucket: BUCKET,
    accessKey: S3_ACCESS,
    secretKey: S3_SECRET,
    lockDays: 1,
  });
  handlers = createAuditHandlers(
    createAuditDependencies({
      db: worker,
      anchors,
      logger: { info: log('info'), warn: log('warn'), error: log('error') },
    }),
  );
}, 300_000);

afterAll(async () => {
  anchors.destroy();
  await worker.$disconnect();
  await admin.$disconnect();
  await Promise.all([postgres.stop(), s3.stop()]);
});

const events = (level: string) => logs.filter((l) => l.level === level).map((l) => l.event);

describe('journal d’audit sur la pile réelle', () => {
  it('partitions entretenues, aucune entrée dans la partition par défaut', async () => {
    expect(await handlers['maintain-partitions']()).toEqual({
      defaultRows: 0,
      failedMonths: 0,
      errorCode: null,
    });
    expect(events('error')).toEqual([]);
  });

  it('ancre la tête, puis vérifie la chaîne contre elle : intègre', async () => {
    for (let i = 0; i < 5; i += 1) await record();
    expect(await handlers['anchor-head']()).toBe('written');
    expect(await handlers['anchor-head']()).toBe('unchanged');
    const latest = await anchors.latest();
    expect(latest?.position).toBeGreaterThanOrEqual(5);
    expect(await handlers['verify-chain']()).toMatchObject({
      anchorPosition: latest?.position,
      defectPosition: null,
    });
    expect(events('error')).toEqual([]);
  });

  it('réécriture complète et cohérente de la chaîne : détectée grâce à l’ancre', async () => {
    const latest = await anchors.latest();
    // Motif réécrit sur la première entrée, puis toute la chaîne et sa tête recalculées.
    await tamper(`DO $$ DECLARE e audit_log; prev bytea := '\\x${'00'.repeat(32)}'; h bytea; BEGIN
      UPDATE audit_log SET reason = 'réécrit' WHERE chain_position = 1;
      FOR e IN SELECT * FROM audit_log ORDER BY chain_position LOOP
        h := oz_audit_hash(prev, e.id, e.chain_position, e.actor_user_id, e.action, e.target_type,
          e.target_id, e.reason, e.request_id, e.metadata, e.created_at);
        UPDATE audit_log SET prev_hash = prev, hash = h WHERE id = e.id;
        prev := h;
      END LOOP;
      UPDATE audit_chain_state SET last_hash = prev WHERE id;
    END $$`);
    const [{ broken } = { broken: 'x' }] = await admin.$queryRawUnsafe<{ broken: string | null }[]>(
      'SELECT oz_audit_verify_chain()::text AS broken',
    );
    // La chaîne seule paraît intègre : seule l'ancre trahit la réécriture.
    expect(broken).toBeNull();
    expect(await handlers['verify-chain']()).toMatchObject({ defectPosition: latest?.position });
    expect(logs.at(-1)).toEqual({
      level: 'error',
      event: 'audit.chain.broken',
      fields: { defectPosition: latest?.position, headPosition: latest?.position },
    });
  });

  it('réécriture prolongée d’une entrée : l’ancrage suivant refuse, la chaîne reste en défaut', async () => {
    const latest = await anchors.latest();
    await record();
    expect(await handlers['anchor-head']()).toBe('refused');
    expect(await anchors.latest()).toEqual(latest);
    expect(await handlers['verify-chain']()).toMatchObject({ defectPosition: latest?.position });
  });
});
