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

  it('mandataires de confiance : 0 par défaut, nombre de sauts de 0 à 5 (lot 1.3ca)', () => {
    expect(loadApiConfig(valid).trustProxy).toBe(0);
    expect(loadApiConfig({ ...valid, TRUST_PROXY: '2' }).trustProxy).toBe(2);
    for (const value of ['6', '-1', 'true', '1.5', ' 1']) {
      expect(errorOf({ ...valid, TRUST_PROXY: value }).invalidVariables).toEqual(['TRUST_PROXY']);
    }
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

describe('authentification (lot 1.3a)', () => {
  it('clé de chiffrement colonne exigée dès FEATURE_AUTH=true, local compris (lot 1.3cb, D3)', () => {
    const withoutKeys = { ...AUTH, DATABASE_ENCRYPTION_KEY: '', DATABASE_BLIND_INDEX_KEY: '' };
    expect(errorOf({ ...valid, ...withoutKeys }).invalidVariables).toEqual([
      'DATABASE_ENCRYPTION_KEY',
    ]);
  });

  const RECAPTCHA = 'r'.repeat(40);
  const accessKey = Buffer.alloc(64, 1).toString('base64');
  const refreshKey = Buffer.alloc(64, 2).toString('base64');
  const AUTH = {
    FEATURE_AUTH: 'true',
    APP_URL: 'http://localhost:3000',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    EMAIL_FROM: 'OZ <no-reply@oz.localhost>',
    AUTH_HMAC_KEY: 'h'.repeat(40),
    JWT_ACCESS_SECRET: accessKey,
    JWT_REFRESH_SECRET: refreshKey,
    ...KEYS,
  };
  const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
  const staging = {
    ...valid,
    ...KEYS,
    APP_ENV: 'staging',
    REDIS_URL: 'rediss://oz:pw@10.10.0.6:6379',
    DATABASE_CA_CERT: CA,
    REDIS_CA_CERT: CA,
  };

  it('désactivée par défaut : aucune variable d’email exigée', () => {
    const config = loadApiConfig(valid);
    expect(config.features.auth).toBe(false);
    expect(config.auth).toBeUndefined();
  });

  it('activée en local : SMTP sans TLS vers Mailpit, adresse d’expédition analysée', () => {
    const config = loadApiConfig({ ...valid, ...AUTH });
    expect(config.features.auth).toBe(true);
    expect(config.auth).toEqual({
      appUrl: 'http://localhost:3000',
      hmacKey: AUTH.AUTH_HMAC_KEY,
      totpEncryptionKey: AUTH.DATABASE_ENCRYPTION_KEY,
      emailFrom: 'OZ <no-reply@oz.localhost>',
      smtp: {
        host: 'localhost',
        port: 1025,
        user: undefined,
        password: undefined,
        requireTls: false,
      },
      tokens: {
        accessKey: new Uint8Array(64).fill(1),
        refreshKey: new Uint8Array(64).fill(2),
        refreshTtlSeconds: 30 * 86_400,
      },
      recaptcha: undefined,
    });
  });

  it('exige chaque variable quand elle est activée', () => {
    expect(
      errorOf({
        ...valid,
        FEATURE_AUTH: 'true',
        AUTH_HMAC_KEY: 'courte',
        EMAIL_FROM: 'pas une adresse',
      }).invalidVariables,
    ).toEqual([
      'APP_URL',
      'AUTH_HMAC_KEY',
      'DATABASE_ENCRYPTION_KEY',
      'EMAIL_FROM',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'SMTP_HOST',
      'SMTP_PORT',
    ]);
  });

  describe('secrets et durées des jetons (lot 1.3b)', () => {
    const short = Buffer.alloc(63, 1).toString('base64');

    it('exige des secrets de 64 octets au moins, en base64', () => {
      expect(
        errorOf({
          ...valid,
          ...AUTH,
          JWT_ACCESS_SECRET: short,
          JWT_REFRESH_SECRET: 'pas-du-base64!',
        }).invalidVariables,
      ).toEqual(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']);
    });

    it('accepte un secret coupé en lignes (sortie d’openssl rand -base64 64)', () => {
      const wrapped = accessKey.replace(/(.{64})/, '$1\n') + '\n';
      expect(
        loadApiConfig({ ...valid, ...AUTH, JWT_ACCESS_SECRET: wrapped }).auth?.tokens.accessKey,
      ).toEqual(new Uint8Array(64).fill(1));
    });

    it('exige deux secrets distincts', () => {
      expect(
        errorOf({ ...valid, ...AUTH, JWT_REFRESH_SECRET: accessKey }).invalidVariables,
      ).toEqual(['JWT_REFRESH_SECRET']);
    });

    it('n’affiche jamais la valeur d’un secret refusé', () => {
      const error = errorOf({ ...valid, ...AUTH, JWT_ACCESS_SECRET: short });
      expect(error.message).not.toContain(short);
    });

    it('jeton d’accès de 15 minutes, et rien d’autre', () => {
      expect(loadApiConfig({ ...valid, ...AUTH, JWT_ACCESS_TTL: '15m' }).auth).toBeDefined();
      expect(errorOf({ ...valid, ...AUTH, JWT_ACCESS_TTL: '1h' }).invalidVariables).toEqual([
        'JWT_ACCESS_TTL',
      ]);
    });

    it('rafraîchissement de 1 à 30 jours, 30 par défaut', () => {
      const ttl = (value: string) =>
        loadApiConfig({ ...valid, ...AUTH, JWT_REFRESH_TTL: value }).auth?.tokens.refreshTtlSeconds;
      expect(ttl('1d')).toBe(86_400);
      expect(ttl('30d')).toBe(30 * 86_400);
      expect(ttl('')).toBe(30 * 86_400);
      for (const value of ['0d', '31d', '30', '2w', '1.5d']) {
        expect(errorOf({ ...valid, ...AUTH, JWT_REFRESH_TTL: value }).invalidVariables).toEqual([
          'JWT_REFRESH_TTL',
        ]);
      }
    });

    it('n’exige aucun secret quand l’authentification est désactivée', () => {
      expect(
        loadApiConfig({ ...valid, JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: '' }).auth,
      ).toBeUndefined();
    });
  });

  it('va par paire pour l’identifiant SMTP', () => {
    expect(errorOf({ ...valid, ...AUTH, SMTP_USER: 'oz' }).invalidVariables).toEqual([
      'SMTP_PASSWORD',
    ]);
  });

  it('exige TLS, identifiants SMTP et https en recette', () => {
    expect(
      errorOf({ ...staging, ...AUTH, APP_URL: 'http://recette.oz.example' }).invalidVariables,
    ).toEqual(['APP_URL', 'RECAPTCHA_SECRET_KEY', 'SMTP_USER']);
    const config = loadApiConfig({
      ...staging,
      ...AUTH,
      APP_URL: 'https://recette.oz.example',
      SMTP_HOST: 'smtp.tem.scaleway.com',
      SMTP_PORT: '465',
      SMTP_USER: 'projet',
      SMTP_PASSWORD: 'secret',
      RECAPTCHA_SECRET_KEY: RECAPTCHA,
    });
    expect(config.auth?.smtp.requireTls).toBe(true);
    expect(config.auth?.recaptcha).toEqual({ secretKey: RECAPTCHA, minScore: 0.5 });
  });

  it('exige aussi TLS, identifiants SMTP et https en prévisualisation', () => {
    const preview = { ...valid, APP_ENV: 'preview' };
    expect(
      errorOf({ ...preview, ...AUTH, APP_URL: 'http://pr-1.oz.example' }).invalidVariables,
    ).toEqual(['APP_URL', 'RECAPTCHA_SECRET_KEY', 'SMTP_USER']);
    const config = loadApiConfig({
      ...preview,
      ...AUTH,
      APP_URL: 'https://pr-1.oz.example',
      SMTP_USER: 'projet',
      SMTP_PASSWORD: 'secret',
      RECAPTCHA_SECRET_KEY: RECAPTCHA,
    });
    expect(config.auth?.smtp.requireTls).toBe(true);
  });

  it('interdite en production avant la protection anti-robot (lot 1.3c)', () => {
    const production = {
      ...staging,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      CORS_ORIGINS: 'https://www.oz.example',
      S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
    };
    expect(
      errorOf({
        ...production,
        ...AUTH,
        APP_URL: 'https://www.oz.example',
        SMTP_USER: 'projet',
        SMTP_PASSWORD: 'secret',
        RECAPTCHA_SECRET_KEY: RECAPTCHA,
      }).invalidVariables,
    ).toEqual(['FEATURE_AUTH']);
  });

  it('refuse une valeur de drapeau ambiguë', () => {
    expect(errorOf({ ...valid, FEATURE_AUTH: 'oui' }).invalidVariables).toEqual(['FEATURE_AUTH']);
  });

  describe('reCAPTCHA v3 (lot 1.3ca, D4)', () => {
    it('facultatif en local : sans secret, vérification sautée', () => {
      expect(loadApiConfig({ ...valid, ...AUTH }).auth?.recaptcha).toBeUndefined();
    });

    it('secret fourni en local : vérification active, seuil configurable', () => {
      expect(
        loadApiConfig({
          ...valid,
          ...AUTH,
          RECAPTCHA_SECRET_KEY: RECAPTCHA,
          RECAPTCHA_MIN_SCORE: '0.7',
        }).auth?.recaptcha,
      ).toEqual({ secretKey: RECAPTCHA, minScore: 0.7 });
    });

    it.each(['1.5', '-0.1', 'abc', '0,5', ' 0.5', '0.555'])('seuil invalide « %s »', (score) => {
      expect(errorOf({ ...valid, ...AUTH, RECAPTCHA_MIN_SCORE: score }).invalidVariables).toEqual([
        'RECAPTCHA_MIN_SCORE',
      ]);
    });

    it.each(['0', '1', '0.3', '1.0'])('seuil accepté « %s »', (score) => {
      expect(() => loadApiConfig({ ...valid, ...AUTH, RECAPTCHA_MIN_SCORE: score })).not.toThrow();
    });

    it('secret trop court refusé', () => {
      expect(
        errorOf({ ...valid, ...AUTH, RECAPTCHA_SECRET_KEY: 'court' }).invalidVariables,
      ).toEqual(['RECAPTCHA_SECRET_KEY']);
    });
  });
});
