import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { StorageConfig } from '../src/index.js';

// Même image que infra/docker/compose.dev.yml (SeaweedFS remplace MinIO).
export const SEAWEED_IMAGE = 'chrislusf/seaweedfs:4.50';

export interface TestStorage {
  readonly config: StorageConfig;
  readonly admin: S3Client;
  stop(): Promise<void>;
}

/** SeaweedFS jetable avec un bucket privé vide ; identifiants de test sans valeur hors du conteneur. */
export async function startStorage(bucket = 'oz-documents-test'): Promise<TestStorage> {
  const accessKey = 'oz-test-access';
  const secretKey = 'oz-test-secret';
  const identities = JSON.stringify({
    identities: [
      {
        name: 'oz-test',
        credentials: [{ accessKey, secretKey }],
        actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
      },
    ],
  });
  const container: StartedTestContainer = await new GenericContainer(SEAWEED_IMAGE)
    .withEntrypoint(['/bin/sh', '-c'])
    .withCommand([
      `printf '%s' '${identities}' > /tmp/s3.json && exec weed server -dir=/data -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=64 -s3 -s3.port=8333 -s3.config=/tmp/s3.json`,
    ])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const config: StorageConfig = {
    endpoint: `http://${container.getHost()}:${String(container.getMappedPort(8333))}`,
    region: 'fr-par',
    bucket,
    accessKey,
    secretKey,
  };
  const admin = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  // Le service S3 de SeaweedFS répond quelques secondes après l'ouverture du port.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await admin.send(new CreateBucketCommand({ Bucket: bucket }));
      break;
    } catch (error) {
      if (attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return {
    config,
    admin,
    async stop() {
      admin.destroy();
      await container.stop();
    },
  };
}
