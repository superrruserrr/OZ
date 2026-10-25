import { describe, expect, it } from 'vitest';
import { ConfigError, loadApiConfig } from './api-config.js';

const valid = {
  NODE_ENV: 'development',
  APP_ENV: 'local',
  API_PORT: '3001',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://oz:oz@localhost:5432/oz',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'fr-par',
  S3_BUCKET: 'oz-documents',
  S3_ACCESS_KEY: 'oz-dev-access',
  S3_SECRET_KEY: 'oz-dev-secret',
  CORS_ORIGINS: 'http://localhost:3000, http://localhost:3002',
};

function errorOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadApiConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('loadApiConfig aurait dû échouer');
}

describe('loadApiConfig (EX-003)', () => {
  it('renvoie une configuration typée, figée, avec les types convertis', () => {
    const config = loadApiConfig(valid);
    expect(config.apiPort).toBe(3001);
    expect(config.appEnv).toBe('local');
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'http://localhost:3002']);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('ignore les variables étrangères au schéma', () => {
    expect(() => loadApiConfig({ ...valid, AUTRE: 'x' })).not.toThrow();
  });

  it('nomme toutes les variables absentes ou invalides', () => {
    const error = errorOf({ ...valid, DATABASE_URL: undefined, API_PORT: 'abc' });
    expect(error.invalidVariables).toEqual(['API_PORT', 'DATABASE_URL']);
    expect(error.message).toMatch(/API_PORT/);
    expect(error.message).toMatch(/DATABASE_URL/);
  });

  it('n’affiche jamais la valeur d’une variable, même invalide', () => {
    const secret = 'ne-doit-jamais-apparaitre-1234';
    const error = errorOf({ ...valid, S3_SECRET_KEY: '', DATABASE_URL: secret, API_PORT: secret });
    const serialized = `${error.message} ${JSON.stringify(error)} ${String(error.stack)}`;
    expect(serialized).not.toContain(secret);
  });

  it('refuse un APP_ENV hors liste', () => {
    expect(errorOf({ ...valid, APP_ENV: 'prod' }).invalidVariables).toEqual(['APP_ENV']);
  });

  it('refuse le joker * et toute origine qui n’est pas une origine URL', () => {
    expect(errorOf({ ...valid, CORS_ORIGINS: '*' }).invalidVariables).toEqual(['CORS_ORIGINS']);
    expect(
      errorOf({ ...valid, CORS_ORIGINS: 'http://localhost:3000/chemin' }).invalidVariables,
    ).toEqual(['CORS_ORIGINS']);
  });

  it('exige des origines https en production', () => {
    const prod = {
      ...valid,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
    };
    expect(errorOf(prod).invalidVariables).toEqual(['CORS_ORIGINS']);
    expect(() => loadApiConfig({ ...prod, CORS_ORIGINS: 'https://www.oz.example' })).not.toThrow();
  });

  it('refuse un port hors plage', () => {
    expect(errorOf({ ...valid, API_PORT: '70000' }).invalidVariables).toEqual(['API_PORT']);
  });

  it.each(['0x10', '1e3', ' 80 ', '80.0', '-1'])('refuse le port mal écrit « %s »', (port) => {
    expect(errorOf({ ...valid, API_PORT: port }).invalidVariables).toEqual(['API_PORT']);
  });

  it('refuse un joker dans une origine, même partiel', () => {
    expect(errorOf({ ...valid, CORS_ORIGINS: 'https://*.example.com' }).invalidVariables).toEqual([
      'CORS_ORIGINS',
    ]);
  });

  const production = {
    ...valid,
    NODE_ENV: 'production',
    APP_ENV: 'production',
    CORS_ORIGINS: 'https://www.oz.example',
    S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
  };

  it('exige NODE_ENV=production quand APP_ENV=production', () => {
    expect(errorOf({ ...production, NODE_ENV: 'development' }).invalidVariables).toEqual([
      'NODE_ENV',
    ]);
  });

  it('exige un stockage en https en production', () => {
    expect(errorOf({ ...production, S3_ENDPOINT: 'http://s3.interne' }).invalidVariables).toEqual([
      'S3_ENDPOINT',
    ]);
    expect(() => loadApiConfig(production)).not.toThrow();
  });
});
