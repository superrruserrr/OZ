import {
  CreateBucketCommand,
  GetObjectRetentionCommand,
  PutObjectCommand,
  PutObjectLockConfigurationCommand,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anchorKey, AuditAnchorStore, StorageError } from '../src/index.js';
import { startStorage, type TestStorage } from './seaweed.js';

// Ancres du journal d'audit (lot 1.16a, D-060) sur SeaweedFS, bucket verrouillé comme en recette.
const BUCKET = 'oz-audit-anchors-test';
const HASH = 'cd'.repeat(32);

let s3: TestStorage | undefined;
let store: AuditAnchorStore | undefined;

const ready = () => {
  if (s3 === undefined || store === undefined) throw new Error('stockage de test non démarré');
  return { s3, store };
};

beforeAll(async () => {
  s3 = await startStorage();
  await s3.admin.send(
    new CreateBucketCommand({ Bucket: BUCKET, ObjectLockEnabledForBucket: true }),
  );
  await s3.admin.send(
    new PutObjectLockConfigurationCommand({
      Bucket: BUCKET,
      ObjectLockConfiguration: {
        ObjectLockEnabled: 'Enabled',
        Rule: { DefaultRetention: { Mode: 'COMPLIANCE', Days: 1 } },
      },
    }),
  );
  store = new AuditAnchorStore({ ...s3.config, bucket: BUCKET, lockDays: 1 });
}, 120_000);

afterAll(async () => {
  store?.destroy();
  await s3?.stop();
});

describe('AuditAnchorStore (SeaweedFS)', () => {
  it('aucune ancre : null', async () => {
    expect(await ready().store.latest()).toBeNull();
  });

  it('écrit, verrouille en COMPLIANCE et relit la plus avancée', async () => {
    const { s3, store } = ready();
    expect(await store.put({ position: 3, hash: HASH })).toBe('written');
    expect(await store.put({ position: 12, hash: 'ef'.repeat(32) })).toBe('written');
    expect(await store.latest()).toEqual({ position: 12, hash: 'ef'.repeat(32) });
    const retention = await s3.admin.send(
      new GetObjectRetentionCommand({ Bucket: BUCKET, Key: anchorKey(12) }),
    );
    expect(retention.Retention?.Mode).toBe('COMPLIANCE');
  });

  it('une position déjà ancrée n’est jamais réécrite', async () => {
    const { store } = ready();
    expect(await store.put({ position: 12, hash: HASH })).toBe('exists');
    expect(await store.latest()).toEqual({ position: 12, hash: 'ef'.repeat(32) });
  });

  it('ancre contrefaite et illisible : erreur, jamais « aucune ancre »', async () => {
    const { s3, store } = ready();
    await s3.admin.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: anchorKey(99), Body: 'pas du JSON' }),
    );
    await expect(store.latest()).rejects.toThrow(StorageError);
  });
});
