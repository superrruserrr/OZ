import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

// Mêmes images que infra/docker/compose.dev.yml (parité développement / tests).
export const POSTGRES_IMAGE = 'postgres:16.15-alpine';
export const REDIS_IMAGE = 'redis:7.4.11-alpine';
export const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.50';

export interface TestServices {
  readonly env: Record<string, string>;
  stop(): Promise<void>;
}

const S3_ACCESS = 'oz-test-access';
const S3_SECRET = 'oz-test-secret';
const BUCKET = 'oz-documents';

/** Démarre PostgreSQL, Redis et SeaweedFS (S3) jetables, et renvoie les variables d'environnement associées. */
export async function startServices(): Promise<TestServices> {
  const [postgres, redis, s3] = await Promise.all<
    [
      Promise<StartedPostgreSqlContainer>,
      Promise<StartedRedisContainer>,
      Promise<StartedTestContainer>,
    ]
  >([
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
  ]);

  // Le maître SeaweedFS peut mettre quelques secondes à accepter la création du bucket.
  for (let attempt = 0; ; attempt++) {
    const result = await s3.exec([
      'sh',
      '-c',
      `echo "s3.bucket.create -name ${BUCKET}" | weed shell`,
    ]);
    const list = await s3.exec(['sh', '-c', 'echo s3.bucket.list | weed shell']);
    if (result.exitCode === 0 && list.output.includes(BUCKET)) break;
    if (attempt >= 30) throw new Error(`bucket ${BUCKET} non créé : ${result.output}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    env: {
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: `http://${s3.getHost()}:${String(s3.getMappedPort(8333))}`,
      S3_ACCESS_KEY: S3_ACCESS,
      S3_SECRET_KEY: S3_SECRET,
      S3_BUCKET: BUCKET,
    },
    stop: async () => {
      await Promise.all([postgres.stop(), redis.stop(), s3.stop()]);
    },
  };
}
