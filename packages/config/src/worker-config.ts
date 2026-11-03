import { z } from 'zod';
import { ConfigError, pemCert } from './api-config.js';
import { APP_ENVS } from './security-headers.js';

// Configuration du worker (lots 1.9b et 1.9cb) : base, Redis, stockage, ClamAV, maintenance du coffre. Mêmes règles que l'API pour
// les variables partagées (TLS épinglé en recette et en production, D-006). En recette et en
// production, le worker se connecte sous son rôle dédié `oz_worker` (`WORKER_DATABASE_URL`, seul
// autorisé à juger un document) ; l'URL de l'API n'y sert jamais. En local seulement, repli sur
// `DATABASE_URL`.

const orDefault = <T extends z.ZodType>(type: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), type);

const postgresUrl = orDefault(
  z
    .string()
    .regex(/^postgres(ql)?:\/\/.+/)
    .optional(),
);

/** Minutes entières entre `min` et 1 440 (un jour) ; vide = `fallback`. */
const everyMinutes = (min: number, fallback: string) =>
  orDefault(
    z
      .string()
      .regex(/^\d{1,4}$/)
      .default(fallback)
      .transform(Number)
      .pipe(z.number().min(min).max(1_440)),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    APP_ENV: z.enum(APP_ENVS),
    LOG_LEVEL: orDefault(
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ),
    DATABASE_URL: postgresUrl,
    WORKER_DATABASE_URL: postgresUrl,
    REDIS_URL: z.string().regex(/^rediss?:\/\/.+/),
    DATABASE_CA_CERT: pemCert,
    REDIS_CA_CERT: pemCert,
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    // Nom d'hôte seul (réseau privé : clamd ne chiffre pas) ; le port est à part.
    CLAMAV_HOST: z.string().regex(/^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/),
    CLAMAV_PORT: orDefault(
      z
        .string()
        .regex(/^[1-9]\d{0,4}$/)
        .default('3310')
        .transform(Number)
        .pipe(z.number().max(65_535)),
    ),
    // Analyses simultanées : ClamAV et le ré-encodage tiennent en mémoire le fichier entier (50 Mo).
    WORKER_CONCURRENCY: orDefault(
      z
        .string()
        .regex(/^[1-8]$/)
        .default('2')
        .transform(Number),
    ),
    // Maintenance du coffre (lot 1.9cb) : purge des pièces échues et balayage des analyses
    // abandonnées, puis objets orphelins, à cadence fixe (jobs planifiés BullMQ).
    DOCUMENT_MAINTENANCE_ENABLED: orDefault(
      z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    ),
    DOCUMENT_PURGE_EVERY_MINUTES: everyMinutes(5, '15'),
    DOCUMENT_ORPHANS_EVERY_MINUTES: everyMinutes(15, '60'),
  })
  .superRefine((env, ctx) => {
    const required = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (isHosted(env.APP_ENV)) {
      if (!env.DATABASE_CA_CERT) required('DATABASE_CA_CERT', 'requis en recette et en production');
      if (!env.REDIS_CA_CERT) required('REDIS_CA_CERT', 'requis en recette et en production');
      if (!env.REDIS_URL.startsWith('rediss://')) required('REDIS_URL', 'rediss:// requis');
      if (/[?&]sslmode=disable(&|$)/.test(env.WORKER_DATABASE_URL ?? '')) {
        required('WORKER_DATABASE_URL', 'sslmode=disable interdit');
      }
    }
    if (env.APP_ENV === 'production' && !env.S3_ENDPOINT.startsWith('https://')) {
      required('S3_ENDPOINT', 'https requis en production');
    }
  })
  .transform((env, ctx) => {
    // Repli sur l'URL de l'API en local seulement : partout ailleurs, rôle dédié `oz_worker`.
    const local = env.APP_ENV === 'local';
    const databaseUrl = local
      ? (env.WORKER_DATABASE_URL ?? env.DATABASE_URL)
      : env.WORKER_DATABASE_URL;
    if (databaseUrl === undefined || (!local && databaseUrl === env.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['WORKER_DATABASE_URL'],
        message: local
          ? 'ou DATABASE_URL requis'
          : 'rôle oz_worker requis, distinct de DATABASE_URL',
      });
      return z.NEVER;
    }
    return { ...env, databaseUrl };
  });

function isHosted(appEnv: (typeof APP_ENVS)[number]): boolean {
  return appEnv === 'staging' || appEnv === 'production';
}

export interface WorkerConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly appEnv: (typeof APP_ENVS)[number];
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
  readonly clamav: { readonly host: string; readonly port: number };
  readonly concurrency: number;
  readonly maintenance: {
    readonly enabled: boolean;
    readonly purgeEveryMinutes: number;
    readonly orphansEveryMinutes: number;
  };
}

/** Lit et valide la configuration du worker ; `ConfigError` nomme les variables fautives. */
export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
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
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.databaseUrl,
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
    clamav: Object.freeze({ host: value.CLAMAV_HOST, port: value.CLAMAV_PORT }),
    concurrency: value.WORKER_CONCURRENCY,
    maintenance: Object.freeze({
      enabled: value.DOCUMENT_MAINTENANCE_ENABLED,
      purgeEveryMinutes: value.DOCUMENT_PURGE_EVERY_MINUTES,
      orphansEveryMinutes: value.DOCUMENT_ORPHANS_EVERY_MINUTES,
    }),
  });
}
