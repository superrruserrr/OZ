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
  })
  .superRefine((env, ctx) => {
    // Recette et production : base et Redis managés joints en TLS épinglé (D-006, lot 0.8b).
    if (env.APP_ENV === 'staging' || env.APP_ENV === 'production') {
      const required = (path: string, message: string): void => {
        ctx.addIssue({ code: 'custom', path: [path], message });
      };
      if (!env.DATABASE_CA_CERT) required('DATABASE_CA_CERT', 'requis en recette et en production');
      if (!env.REDIS_CA_CERT) required('REDIS_CA_CERT', 'requis en recette et en production');
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
  readonly s3: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
  };
  readonly corsOrigins: readonly string[];
  readonly features: { readonly contactForm: boolean };
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
    s3: Object.freeze({
      endpoint: value.S3_ENDPOINT,
      region: value.S3_REGION,
      bucket: value.S3_BUCKET,
      accessKey: value.S3_ACCESS_KEY,
      secretKey: value.S3_SECRET_KEY,
    }),
    corsOrigins: Object.freeze([...value.CORS_ORIGINS]),
    features: Object.freeze({ contactForm: value.FEATURE_CONTACT_FORM === 'true' }),
  });
}
