import { describe, expect, it } from 'vitest';
import { ConfigError } from './api-config.js';
import { loadWorkerConfig } from './worker-config.js';

const valid = {
  NODE_ENV: 'development',
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://oz:oz@localhost:5432/oz',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'fr-par',
  S3_BUCKET: 'oz-documents',
  S3_ACCESS_KEY: 'oz-dev-access',
  S3_SECRET_KEY: 'super-secret-value',
  CLAMAV_HOST: 'localhost',
};
const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
const hosted = {
  ...valid,
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  DATABASE_URL: undefined,
  WORKER_DATABASE_URL: 'postgresql://oz_worker:pw@10.10.0.5:5432/oz?sslmode=require',
  REDIS_URL: 'rediss://oz:pw@10.10.0.6:6379',
  S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
  DATABASE_CA_CERT: CA,
  REDIS_CA_CERT: CA,
  CLAMAV_HOST: 'clamav.internal',
};

function errorOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadWorkerConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('loadWorkerConfig aurait dû échouer');
}

describe('loadWorkerConfig (lot 1.9b)', () => {
  it('valeurs par défaut : ClamAV sur 3310, concurrence 2, journal info', () => {
    expect(loadWorkerConfig(valid)).toEqual({
      nodeEnv: 'development',
      appEnv: 'local',
      logLevel: 'info',
      databaseUrl: valid.DATABASE_URL,
      redisUrl: valid.REDIS_URL,
      databaseCaCert: undefined,
      redisCaCert: undefined,
      s3: {
        endpoint: valid.S3_ENDPOINT,
        region: 'fr-par',
        bucket: 'oz-documents',
        accessKey: 'oz-dev-access',
        secretKey: 'super-secret-value',
      },
      clamav: { host: 'localhost', port: 3310 },
      concurrency: 2,
      maintenance: { enabled: true, purgeEveryMinutes: 15, orphansEveryMinutes: 60 },
    });
  });

  it('maintenance du coffre (lot 1.9cb) : désactivable, cadences bornées', () => {
    expect(
      loadWorkerConfig({
        ...valid,
        DOCUMENT_MAINTENANCE_ENABLED: 'false',
        DOCUMENT_PURGE_EVERY_MINUTES: '5',
        DOCUMENT_ORPHANS_EVERY_MINUTES: '1440',
      }).maintenance,
    ).toEqual({ enabled: false, purgeEveryMinutes: 5, orphansEveryMinutes: 1440 });
    expect(
      loadWorkerConfig({
        ...valid,
        DOCUMENT_MAINTENANCE_ENABLED: '',
        DOCUMENT_PURGE_EVERY_MINUTES: '',
        DOCUMENT_ORPHANS_EVERY_MINUTES: '',
      }).maintenance,
    ).toEqual({ enabled: true, purgeEveryMinutes: 15, orphansEveryMinutes: 60 });
    expect(errorOf({ ...valid, DOCUMENT_MAINTENANCE_ENABLED: 'oui' }).message).toContain(
      'DOCUMENT_MAINTENANCE_ENABLED',
    );
    for (const value of ['4', '1441', '1.5', 'x']) {
      expect(errorOf({ ...valid, DOCUMENT_PURGE_EVERY_MINUTES: value }).message).toContain(
        'DOCUMENT_PURGE_EVERY_MINUTES',
      );
    }
    for (const value of ['14', '1441']) {
      expect(errorOf({ ...valid, DOCUMENT_ORPHANS_EVERY_MINUTES: value }).message).toContain(
        'DOCUMENT_ORPHANS_EVERY_MINUTES',
      );
    }
  });

  it('lit port ClamAV et concurrence ; vide = valeur par défaut', () => {
    const config = loadWorkerConfig({ ...valid, CLAMAV_PORT: '3311', WORKER_CONCURRENCY: '8' });
    expect(config.clamav.port).toBe(3311);
    expect(config.concurrency).toBe(8);
    expect(loadWorkerConfig({ ...valid, CLAMAV_PORT: '', WORKER_CONCURRENCY: '' })).toMatchObject({
      clamav: { port: 3310 },
      concurrency: 2,
    });
  });

  it('configuration figée', () => {
    const config = loadWorkerConfig(valid);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.s3)).toBe(true);
    expect(Object.isFrozen(config.clamav)).toBe(true);
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: 'mysql://localhost/oz' }],
    ['REDIS_URL', { REDIS_URL: 'http://localhost:6379' }],
    ['S3_SECRET_KEY', { S3_SECRET_KEY: '' }],
    ['S3_BUCKET', { S3_BUCKET: 'Bucket_Majuscule' }],
    ['CLAMAV_HOST', { CLAMAV_HOST: undefined }],
    ['CLAMAV_HOST', { CLAMAV_HOST: 'clamav:3310' }],
    ['CLAMAV_PORT', { CLAMAV_PORT: '0' }],
    ['CLAMAV_PORT', { CLAMAV_PORT: '65536' }],
    ['CLAMAV_PORT', { CLAMAV_PORT: '0x10' }],
    ['WORKER_CONCURRENCY', { WORKER_CONCURRENCY: '0' }],
    ['WORKER_CONCURRENCY', { WORKER_CONCURRENCY: '9' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'verbose' }],
    ['APP_ENV', { APP_ENV: 'dev' }],
  ])('refuse %s invalide', (name, override) => {
    expect(errorOf({ ...valid, ...override }).invalidVariables).toContain(name);
  });

  it('les messages nomment les variables, jamais leurs valeurs', () => {
    const error = errorOf({ ...valid, CLAMAV_HOST: undefined, S3_ENDPOINT: 'ftp://x' });
    expect(error.message).not.toContain(valid.S3_SECRET_KEY);
    expect(error.message).not.toContain('postgresql://');
    expect(error.invalidVariables).toEqual(['CLAMAV_HOST', 'S3_ENDPOINT']);
  });

  it('environnement illisible : erreur globale « configuration »', () => {
    expect(errorOf(null as never).invalidVariables).toEqual(['configuration']);
  });

  it('recette : TLS épinglé vers la base et Redis', () => {
    expect(loadWorkerConfig(hosted).redisCaCert).toBe(CA);
    expect(
      errorOf({ ...hosted, DATABASE_CA_CERT: '', REDIS_CA_CERT: undefined }).invalidVariables,
    ).toEqual(['DATABASE_CA_CERT', 'REDIS_CA_CERT']);
    expect(errorOf({ ...hosted, REDIS_URL: 'redis://10.10.0.6:6379' }).invalidVariables).toEqual([
      'REDIS_URL',
    ]);
    expect(
      errorOf({ ...hosted, WORKER_DATABASE_URL: `${valid.DATABASE_URL}?sslmode=disable` })
        .invalidVariables,
    ).toEqual(['WORKER_DATABASE_URL']);
  });

  it('local : URL du worker si fournie, sinon DATABASE_URL', () => {
    expect(loadWorkerConfig(valid).databaseUrl).toBe(valid.DATABASE_URL);
    const own = 'postgresql://oz_worker:oz@localhost:5432/oz';
    expect(loadWorkerConfig({ ...valid, WORKER_DATABASE_URL: own }).databaseUrl).toBe(own);
    expect(loadWorkerConfig({ ...valid, WORKER_DATABASE_URL: '' }).databaseUrl).toBe(
      valid.DATABASE_URL,
    );
    expect(errorOf({ ...valid, DATABASE_URL: undefined }).invalidVariables).toEqual([
      'WORKER_DATABASE_URL',
    ]);
    expect(errorOf({ ...valid, WORKER_DATABASE_URL: 'mysql://x' }).invalidVariables).toEqual([
      'WORKER_DATABASE_URL',
    ]);
  });

  it('préversion : pas de repli sur DATABASE_URL, rôle dédié exigé', () => {
    const preview = { ...valid, APP_ENV: 'preview' };
    expect(errorOf(preview).invalidVariables).toEqual(['WORKER_DATABASE_URL']);
    const own = 'postgresql://oz_worker:pw@db:5432/oz';
    expect(loadWorkerConfig({ ...preview, WORKER_DATABASE_URL: own }).databaseUrl).toBe(own);
  });

  it('hors local : même URL que l’API refusée (rôle oz_app)', () => {
    expect(
      errorOf({ ...hosted, DATABASE_URL: hosted.WORKER_DATABASE_URL }).invalidVariables,
    ).toEqual(['WORKER_DATABASE_URL']);
  });

  it('recette : rôle dédié `oz_worker` obligatoire, jamais l’URL de l’API', () => {
    expect(loadWorkerConfig(hosted).databaseUrl).toBe(hosted.WORKER_DATABASE_URL);
    // L'URL de l'API (`oz_app`) présente dans l'environnement est ignorée.
    expect(
      loadWorkerConfig({ ...hosted, DATABASE_URL: 'postgresql://oz_app:pw@10.10.0.5:5432/oz' })
        .databaseUrl,
    ).toBe(hosted.WORKER_DATABASE_URL);
    expect(
      errorOf({ ...hosted, WORKER_DATABASE_URL: undefined, DATABASE_URL: valid.DATABASE_URL })
        .invalidVariables,
    ).toEqual(['WORKER_DATABASE_URL']);
  });

  it('production : stockage en https', () => {
    const production = { ...hosted, APP_ENV: 'production' };
    expect(loadWorkerConfig(production).appEnv).toBe('production');
    expect(errorOf({ ...production, S3_ENDPOINT: 'http://s3.internal' }).invalidVariables).toEqual([
      'S3_ENDPOINT',
    ]);
  });
});
