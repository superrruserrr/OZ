import { z } from 'zod';
import { APP_ENVS } from './security-headers.js';

/** Erreur de configuration : nomme les variables fautives, n'expose jamais leurs valeurs (EX-003, EX-T19). */
export class ConfigError extends Error {
  readonly invalidVariables: readonly string[];

  constructor(invalidVariables: readonly string[]) {
    super(
      `Configuration invalide : ${invalidVariables.join(', ')}. Vérifier ces variables d'environnement (voir .env.example).`,
    );
    this.name = 'ConfigError';
    this.invalidVariables = invalidVariables;
  }
}

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    // `*` refusé partout : la liste blanche est exacte, jamais un motif (https://*.exemple).
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      !value.includes('*')
    );
  } catch {
    return false;
  }
});

// Vide = absent : un .env copié de .env.example déclare ces variables sans valeur.
const pemCert = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .transform((value) => value.replaceAll('\\n', '\n').trim())
    .pipe(z.string().regex(/^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----$/))
    .optional(),
);

// Clé de chiffrement colonne (pgcrypto, plan §6.9) : 32 caractères au moins ; vide = absente.
const columnKey = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(32).optional(),
);

// Variable facultative : vide = absente (.env copié de .env.example).
const optional = <T extends z.ZodType>(type: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), type.optional());

// Expéditeur : « Nom <adresse> » ou adresse seule.
const mailbox = z
  .string()
  .regex(/^(?:[^<>\r\n]{1,64} )?<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/)
  .refine((value) => value.includes('<') === value.endsWith('>'));

// Secret de jeton (lot 1.3b) : base64 standard, 64 octets décodés au moins (valeur Terraform).
const JWT_SECRET_MIN_BYTES = 64;
// Espaces et sauts de ligne retirés : `openssl rand -base64 64` coupe sa sortie en deux lignes.
const jwtSecret = optional(
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/))
    .transform((value) => new Uint8Array(Buffer.from(value, 'base64')))
    .refine((bytes) => bytes.byteLength >= JWT_SECRET_MIN_BYTES),
);
const DAY_SECONDS = 86_400;
// Rafraîchissement : de 1 à 30 jours (EX-103 n° 4, D1 du lot 1.3b), glissant à chaque rotation.
const refreshTtl = optional(
  z
    .string()
    .regex(/^([1-9]|[12]\d|30)d$/)
    .transform((value) => Number.parseInt(value, 10) * DAY_SECONDS),
);

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    APP_ENV: z.enum(APP_ENVS),
    // Chiffres décimaux uniquement : pas de 0x10, 1e3 ni d'espaces tolérés par une conversion libre.
    API_PORT: z
      .string()
      .regex(/^[1-9]\d{0,4}$/)
      .transform(Number)
      .pipe(z.number().max(65_535)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/),
    REDIS_URL: z.string().regex(/^rediss?:\/\/.+/),
    // Autorités Scaleway de la base et de Redis (PEM ; « \n » littéraux acceptés, D-006).
    DATABASE_CA_CERT: pemCert,
    REDIS_CA_CERT: pemCert,
    // Chiffrement colonne et index aveugle (D2 du lot 1.1) ; exigées en recette et en production.
    DATABASE_ENCRYPTION_KEY: columnKey,
    DATABASE_BLIND_INDEX_KEY: columnKey,
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    CORS_ORIGINS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== ''),
      )
      .pipe(z.array(origin).min(1)),
    // Drapeaux (R13) : « true » ou « false » uniquement, désactivés par défaut.
    FEATURE_CONTACT_FORM: z.enum(['true', 'false']).default('false'),
    // Comptes (lot 1.3a) : exigées seulement quand FEATURE_AUTH=true.
    FEATURE_AUTH: z.enum(['true', 'false']).default('false'),
    APP_URL: optional(origin),
    SMTP_HOST: optional(z.string().regex(/^[A-Za-z0-9.-]{1,253}$/)),
    SMTP_PORT: optional(
      z
        .string()
        .regex(/^[1-9]\d{0,4}$/)
        .transform(Number)
        .pipe(z.number().max(65_535)),
    ),
    SMTP_USER: optional(z.string()),
    SMTP_PASSWORD: optional(z.string()),
    EMAIL_FROM: optional(mailbox),
    // Clé des empreintes HMAC (compteurs d'échecs dans Redis sans email en clair).
    AUTH_HMAC_KEY: optional(z.string().min(32)),
    // Jetons (lot 1.3b) : exigés seulement quand FEATURE_AUTH=true.
    JWT_ACCESS_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtSecret,
    // Accès : 15 minutes, fixe (EX-103 n° 3) ; la variable n'existe que pour le dire.
    JWT_ACCESS_TTL: optional(z.literal('15m')),
    JWT_REFRESH_TTL: refreshTtl,
  })
  .superRefine((env, ctx) => {
    // Les deux clés vont ensemble, et diffèrent : un index aveugle ne doit rien révéler du chiffrement.
    if (
      (env.DATABASE_ENCRYPTION_KEY === undefined) !==
      (env.DATABASE_BLIND_INDEX_KEY === undefined)
    ) {
      const missing =
        env.DATABASE_ENCRYPTION_KEY === undefined
          ? 'DATABASE_ENCRYPTION_KEY'
          : 'DATABASE_BLIND_INDEX_KEY';
      ctx.addIssue({ code: 'custom', path: [missing], message: 'les deux clés vont ensemble' });
    } else if (
      env.DATABASE_ENCRYPTION_KEY !== undefined &&
      env.DATABASE_ENCRYPTION_KEY === env.DATABASE_BLIND_INDEX_KEY
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_BLIND_INDEX_KEY'],
        message: 'clé distincte requise',
      });
    }
    const hosted = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
    if (env.FEATURE_AUTH === 'true') {
      // Hors local (prévisualisation comprise), les emails portent des jetons : SMTP authentifié et
      // chiffré, liens en https.
      const remote = env.APP_ENV !== 'local';
      for (const name of [
        'APP_URL',
        'SMTP_HOST',
        'SMTP_PORT',
        'EMAIL_FROM',
        'AUTH_HMAC_KEY',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
      ] as const) {
        if (env[name] === undefined) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'requis quand FEATURE_AUTH=true' });
        }
      }
      // Deux secrets distincts : une fuite de l'un ne permet ni de signer ni d'empreinter avec l'autre.
      if (
        env.JWT_ACCESS_SECRET !== undefined &&
        env.JWT_REFRESH_SECRET !== undefined &&
        sameBytes(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_REFRESH_SECRET'],
          message: 'secret distinct requis',
        });
      }
      if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
        const missing = env.SMTP_USER === undefined ? 'SMTP_USER' : 'SMTP_PASSWORD';
        ctx.addIssue({ code: 'custom', path: [missing], message: 'les deux vont ensemble' });
      } else if (remote && env.SMTP_USER === undefined) {
        ctx.addIssue({ code: 'custom', path: ['SMTP_USER'], message: 'requis hors local' });
      }
      if (remote && env.APP_URL?.startsWith('https://') === false) {
        ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'https requis' });
      }
    }
    // Recette et production : base et Redis managés joints en TLS épinglé (D-006, lot 0.8b).
    if (hosted) {
      const required = (path: string, message: string): void => {
        ctx.addIssue({ code: 'custom', path: [path], message });
      };
      if (!env.DATABASE_CA_CERT) required('DATABASE_CA_CERT', 'requis en recette et en production');
      if (!env.REDIS_CA_CERT) required('REDIS_CA_CERT', 'requis en recette et en production');
      if (!env.DATABASE_ENCRYPTION_KEY) {
        required('DATABASE_ENCRYPTION_KEY', 'requis en recette et en production');
      }
      if (!env.DATABASE_BLIND_INDEX_KEY) {
        required('DATABASE_BLIND_INDEX_KEY', 'requis en recette et en production');
      }
      if (!env.REDIS_URL.startsWith('rediss://')) required('REDIS_URL', 'rediss:// requis');
      if (/[?&]sslmode=disable(&|$)/.test(env.DATABASE_URL)) {
        required('DATABASE_URL', 'sslmode=disable interdit');
      }
    }
    if (env.APP_ENV !== 'production') return;
    // Formulaire de contact public : ni limitation de débit (lot 1.3) ni email (lot 1.15) avant ces lots.
    if (env.FEATURE_CONTACT_FORM === 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['FEATURE_CONTACT_FORM'],
        message: 'interdit en production avant les lots 1.3 et 1.15',
      });
    }
    // Inscription publique : pas avant la protection anti-robot et la limitation de débit (lot 1.3c).
    if (env.FEATURE_AUTH === 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['FEATURE_AUTH'],
        message: 'interdit en production avant le lot 1.3c',
      });
    }
    if (env.NODE_ENV !== 'production') {
      ctx.addIssue({ code: 'custom', path: ['NODE_ENV'], message: 'production requis' });
    }
    // TLS partout en production (§6.4 A02) ; base et Redis : voir ci-dessus.
    if (!env.S3_ENDPOINT.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: 'https requis en production',
      });
    }
    if (env.CORS_ORIGINS.some((item) => !item.startsWith('https://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'https requis en production',
      });
    }
  });

export interface ApiConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly appEnv: 'local' | 'preview' | 'staging' | 'production';
  readonly apiPort: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly databaseCaCert: string | undefined;
  readonly redisCaCert: string | undefined;
  /** Clés pgcrypto passées en paramètre des requêtes (oz_encrypt, oz_blind_index) ; absentes en local. */
  readonly columnEncryption: { readonly key: string; readonly blindIndexKey: string } | undefined;
  readonly s3: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
  };
  readonly corsOrigins: readonly string[];
  readonly features: { readonly contactForm: boolean; readonly auth: boolean };
  /** Comptes (lot 1.3a) : présent seulement quand FEATURE_AUTH=true. */
  readonly auth: AuthConfig | undefined;
}

export interface AuthConfig {
  /** Origine du site web : liens des emails de confirmation et de réinitialisation. */
  readonly appUrl: string;
  readonly hmacKey: string;
  readonly emailFrom: string;
  readonly smtp: {
    readonly host: string;
    readonly port: number;
    readonly user: string | undefined;
    readonly password: string | undefined;
    /** TLS exigé (implicite sur 465, STARTTLS obligatoire sinon) hors poste local et prévisualisation. */
    readonly requireTls: boolean;
  };
  /** Jetons (lot 1.3b) : clés HS256 et HMAC décodées, durée du rafraîchissement en secondes. */
  readonly tokens: {
    readonly accessKey: Uint8Array;
    readonly refreshKey: Uint8Array;
    readonly refreshTtlSeconds: number;
  };
}

/** Charge et valide la configuration de l'API. Lève `ConfigError` au lieu de démarrer avec un état invalide. */
export function loadApiConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'configuration'))),
    ].sort();
    throw new ConfigError(names);
  }
  const value = result.data;
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    appEnv: value.APP_ENV,
    apiPort: value.API_PORT,
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.DATABASE_URL,
    redisUrl: value.REDIS_URL,
    databaseCaCert: value.DATABASE_CA_CERT,
    redisCaCert: value.REDIS_CA_CERT,
    columnEncryption:
      value.DATABASE_ENCRYPTION_KEY !== undefined && value.DATABASE_BLIND_INDEX_KEY !== undefined
        ? Object.freeze({
            key: value.DATABASE_ENCRYPTION_KEY,
            blindIndexKey: value.DATABASE_BLIND_INDEX_KEY,
          })
        : undefined,
    s3: Object.freeze({
      endpoint: value.S3_ENDPOINT,
      region: value.S3_REGION,
      bucket: value.S3_BUCKET,
      accessKey: value.S3_ACCESS_KEY,
      secretKey: value.S3_SECRET_KEY,
    }),
    corsOrigins: Object.freeze([...value.CORS_ORIGINS]),
    features: Object.freeze({
      contactForm: value.FEATURE_CONTACT_FORM === 'true',
      auth: value.FEATURE_AUTH === 'true',
    }),
    auth:
      value.FEATURE_AUTH === 'true' &&
      value.APP_URL !== undefined &&
      value.AUTH_HMAC_KEY !== undefined &&
      value.EMAIL_FROM !== undefined &&
      value.SMTP_HOST !== undefined &&
      value.SMTP_PORT !== undefined &&
      value.JWT_ACCESS_SECRET !== undefined &&
      value.JWT_REFRESH_SECRET !== undefined
        ? Object.freeze({
            appUrl: value.APP_URL,
            hmacKey: value.AUTH_HMAC_KEY,
            emailFrom: value.EMAIL_FROM,
            smtp: Object.freeze({
              host: value.SMTP_HOST,
              port: value.SMTP_PORT,
              user: value.SMTP_USER,
              password: value.SMTP_PASSWORD,
              requireTls: value.APP_ENV !== 'local',
            }),
            tokens: Object.freeze({
              accessKey: value.JWT_ACCESS_SECRET,
              refreshKey: value.JWT_REFRESH_SECRET,
              refreshTtlSeconds: value.JWT_REFRESH_TTL ?? 30 * DAY_SECONDS,
            }),
          })
        : undefined,
  });
}
