import { readFileSync } from 'node:fs';
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

// Clés de chiffrement colonne factices (plan §6.9, D2 du lot 1.1).
const KEYS = {
  DATABASE_ENCRYPTION_KEY: 'e'.repeat(40),
  DATABASE_BLIND_INDEX_KEY: 'i'.repeat(40),
};

describe('clés de chiffrement colonne (D2 du lot 1.1)', () => {
  const staging = {
    ...valid,
    APP_ENV: 'staging',
    REDIS_URL: 'rediss://oz:pw@10.10.0.6:6379',
    DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----',
    REDIS_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----',
  };

  it('facultatives en local, transmises quand elles sont fournies', () => {
    expect(loadApiConfig(valid).columnEncryption).toBeUndefined();
    expect(loadApiConfig({ ...valid, ...KEYS }).columnEncryption).toEqual({
      key: KEYS.DATABASE_ENCRYPTION_KEY,
      blindIndexKey: KEYS.DATABASE_BLIND_INDEX_KEY,
    });
  });

  it('exigées en recette et en production', () => {
    expect(errorOf(staging).invalidVariables).toEqual([
      'DATABASE_BLIND_INDEX_KEY',
      'DATABASE_ENCRYPTION_KEY',
    ]);
    expect(() => loadApiConfig({ ...staging, ...KEYS })).not.toThrow();
  });

  it('refuse une clé trop courte, une seule des deux, ou deux clés identiques', () => {
    expect(
      errorOf({ ...valid, ...KEYS, DATABASE_ENCRYPTION_KEY: 'courte' }).invalidVariables,
    ).toEqual(['DATABASE_ENCRYPTION_KEY']);
    expect(
      errorOf({ ...valid, DATABASE_ENCRYPTION_KEY: KEYS.DATABASE_ENCRYPTION_KEY }).invalidVariables,
    ).toEqual(['DATABASE_BLIND_INDEX_KEY']);
    expect(
      errorOf({
        ...valid,
        ...KEYS,
        DATABASE_BLIND_INDEX_KEY: KEYS.DATABASE_ENCRYPTION_KEY,
      }).invalidVariables,
    ).toEqual(['DATABASE_BLIND_INDEX_KEY']);
  });

  it('vide = absente (un .env copié de .env.example)', () => {
    expect(
      loadApiConfig({ ...valid, DATABASE_ENCRYPTION_KEY: '', DATABASE_BLIND_INDEX_KEY: '' })
        .columnEncryption,
    ).toBeUndefined();
  });
});

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
      REDIS_URL: 'rediss://oz:pw@10.10.0.6:6379',
      DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----',
      REDIS_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----',
      ...KEYS,
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

  const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
  const production = {
    ...valid,
    NODE_ENV: 'production',
    APP_ENV: 'production',
    CORS_ORIGINS: 'https://www.oz.example',
    S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
    REDIS_URL: 'rediss://oz:pw@10.10.0.6:6379',
    DATABASE_CA_CERT: CA,
    REDIS_CA_CERT: CA,
    ...KEYS,
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

  describe('TLS de la base et de Redis en recette et en production (D-006)', () => {
    const secured = production;

    it.each(['staging', 'production'])('%s : certificats et rediss:// exigés', (appEnv) => {
      const env = {
        ...production,
        APP_ENV: appEnv,
        REDIS_URL: 'redis://10.10.0.6:6379',
        DATABASE_CA_CERT: undefined,
        REDIS_CA_CERT: undefined,
      };
      expect(errorOf(env).invalidVariables).toEqual([
        'DATABASE_CA_CERT',
        'REDIS_CA_CERT',
        'REDIS_URL',
      ]);
      expect(() => loadApiConfig({ ...secured, APP_ENV: appEnv })).not.toThrow();
    });

    it('refuse sslmode=disable en recette et en production', () => {
      expect(
        errorOf({ ...secured, DATABASE_URL: 'postgresql://u:p@h/oz?sslmode=disable' })
          .invalidVariables,
      ).toEqual(['DATABASE_URL']);
    });

    it("refuse un certificat qui n'est pas au format PEM", () => {
      expect(errorOf({ ...secured, REDIS_CA_CERT: 'abc' }).invalidVariables).toEqual([
        'REDIS_CA_CERT',
      ]);
    });

    it('accepte un certificat sur une ligne avec des \\n littéraux (variables Coolify)', () => {
      const config = loadApiConfig({ ...secured, DATABASE_CA_CERT: CA.replaceAll('\n', '\\n') });
      expect(config.databaseCaCert).toBe(CA);
      expect(config.redisCaCert).toBe(CA);
    });

    it('reste facultatif en local', () => {
      expect(loadApiConfig(valid).databaseCaCert).toBeUndefined();
    });

    it('traite une variable vide comme absente (.env copié de .env.example)', () => {
      const config = loadApiConfig({ ...valid, DATABASE_CA_CERT: '', REDIS_CA_CERT: '' });
      expect(config.databaseCaCert).toBeUndefined();
      expect(config.redisCaCert).toBeUndefined();
      expect(errorOf({ ...secured, DATABASE_CA_CERT: '' }).invalidVariables).toEqual([
        'DATABASE_CA_CERT',
      ]);
    });

    it('accepte .env.example tel quel (premier démarrage local)', () => {
      const text = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
      const env: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
        if (match?.[1]) env[match[1]] = (match[2] ?? '').replace(/\s+#.*$/, '').trim();
      }
      expect(() => loadApiConfig(env)).not.toThrow();
    });
  });

  it('désactive le formulaire de contact par défaut', () => {
    expect(loadApiConfig(valid).features.contactForm).toBe(false);
    expect(loadApiConfig({ ...valid, FEATURE_CONTACT_FORM: 'true' }).features.contactForm).toBe(
      true,
    );
  });

  it('refuse une valeur de drapeau ambiguë', () => {
    expect(errorOf({ ...valid, FEATURE_CONTACT_FORM: 'yes' }).invalidVariables).toEqual([
      'FEATURE_CONTACT_FORM',
    ]);
  });

  it('refuse le formulaire de contact en production (ni limitation de débit ni email avant 1.3 / 1.15)', () => {
    expect(errorOf({ ...production, FEATURE_CONTACT_FORM: 'true' }).invalidVariables).toEqual([
      'FEATURE_CONTACT_FORM',
    ]);
  });
});
