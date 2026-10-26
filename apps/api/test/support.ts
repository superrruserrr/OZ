import { loadApiConfig, type ApiConfig } from '@oz/config';

/** Environnement valide de test ; les URL pointent vers des services absents sauf si surchargées. */
export const validEnv: Record<string, string> = {
  NODE_ENV: 'test',
  APP_ENV: 'local',
  API_PORT: '3001',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://oz:oz@127.0.0.1:1/oz',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'fr-par',
  S3_BUCKET: 'oz-documents',
  S3_ACCESS_KEY: 'oz-test-access',
  S3_SECRET_KEY: 'oz-test-secret',
  CORS_ORIGINS: 'http://localhost:3000',
};

export function testConfig(overrides: Record<string, string> = {}): ApiConfig {
  return loadApiConfig({ ...validEnv, ...overrides });
}

/** Surcharges d'une configuration de production valide (NODE_ENV, https partout). */
export const productionOverrides: Record<string, string> = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  CORS_ORIGINS: 'https://www.oz.example',
  S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
};
