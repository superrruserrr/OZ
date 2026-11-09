import { z } from 'zod';
import { columnKey, ConfigError, mailbox, origin, pemCert } from './api-config.js';
import { APP_ENVS } from './security-headers.js';

// Configuration du worker (lots 1.9b, 1.9cb, 1.16a et 1.16bb) : base, Redis, stockage, ClamAV,
// maintenance du coffre et du journal d'audit, export des données personnelles, suppression de compte (1.16cba) (clé de chiffrement
// colonne, SMTP de l'email « archive prête »). Mêmes règles que l'API pour
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
    // Journal d'audit (lot 1.16a) : partitions chaque jour, ancrage de la tête et vérification de
    // la chaîne à cadence fixe. Sans bucket d'ancres (local, aperçu), pas d'ancrage : la chaîne est
    // vérifiée seule. En recette et en production, entretien toujours actif et bucket verrouillé
    // requis (D-060).
    AUDIT_MAINTENANCE_ENABLED: orDefault(
      z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    ),
    AUDIT_ANCHOR_EVERY_MINUTES: everyMinutes(5, '60'),
    AUDIT_VERIFY_EVERY_MINUTES: everyMinutes(60, '1440'),
    AUDIT_ANCHOR_BUCKET: orDefault(
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
        .optional(),
    ),
    AUDIT_ANCHOR_LOCK_DAYS: orDefault(
      z
        .string()
        .regex(/^\d{1,4}$/)
        .default('0')
        .transform(Number)
        .pipe(z.number().max(3_650)),
    ),
    // Export des données personnelles (lot 1.16bb) : sans clé, la file `data-export` n'est pas
    // consommée (local) ; sans SMTP, l'archive est produite sans email (local).
    DATABASE_ENCRYPTION_KEY: columnKey,
    DATA_EXPORT_EVERY_MINUTES: everyMinutes(5, '15'),
    // Suppression de compte (lot 1.16cba) : anonymisation des demandes échues à cadence fixe.
    // Toujours active en recette et en production (EX-118 n° 3).
    ACCOUNT_DELETION_ENABLED: orDefault(
      z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    ),
    ACCOUNT_DELETION_EVERY_MINUTES: everyMinutes(5, '60'),
    APP_URL: orDefault(origin.optional()),
    SMTP_HOST: orDefault(
      z
        .string()
        .regex(/^[A-Za-z0-9.-]{1,253}$/)
        .optional(),
    ),
    SMTP_PORT: orDefault(
      z
        .string()
        .regex(/^[1-9]\d{0,4}$/)
        .default('587')
        .transform(Number)
        .pipe(z.number().max(65_535)),
    ),
    SMTP_USER: orDefault(z.string().optional()),
    SMTP_PASSWORD: orDefault(z.string().optional()),
    EMAIL_FROM: orDefault(mailbox.optional()),
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
      if (env.AUDIT_ANCHOR_BUCKET === undefined) {
        required('AUDIT_ANCHOR_BUCKET', 'requis en recette et en production');
      }
      if (!env.AUDIT_MAINTENANCE_ENABLED) {
        required('AUDIT_MAINTENANCE_ENABLED', 'toujours actif en recette et en production');
      }
      if (!env.ACCOUNT_DELETION_ENABLED) {
        required('ACCOUNT_DELETION_ENABLED', 'toujours actif en recette et en production');
      }
      if (env.AUDIT_ANCHOR_LOCK_DAYS < 30) {
        required('AUDIT_ANCHOR_LOCK_DAYS', '30 jours au moins en recette et en production');
      }
    }
    // SMTP : tout ou rien ; identifiants par paire.
    const mail = [env.SMTP_HOST, env.EMAIL_FROM, env.APP_URL];
    if (mail.some((value) => value !== undefined) && mail.some((value) => value === undefined)) {
      for (const [name, value] of [
        ['SMTP_HOST', env.SMTP_HOST],
        ['EMAIL_FROM', env.EMAIL_FROM],
        ['APP_URL', env.APP_URL],
      ] as const) {
        if (value === undefined) required(name, 'requis avec les autres variables SMTP');
      }
    }
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      required(
        env.SMTP_USER === undefined ? 'SMTP_USER' : 'SMTP_PASSWORD',
        'les deux vont ensemble',
      );
    }
    if (isHosted(env.APP_ENV)) {
      if (!env.DATABASE_ENCRYPTION_KEY) {
        required('DATABASE_ENCRYPTION_KEY', 'requis en recette et en production');
      }
      for (const [name, value] of [
        ['SMTP_HOST', env.SMTP_HOST],
        ['SMTP_USER', env.SMTP_USER],
        ['EMAIL_FROM', env.EMAIL_FROM],
        ['APP_URL', env.APP_URL],
      ] as const) {
        if (value === undefined) required(name, 'requis en recette et en production');
      }
      if (env.APP_URL?.startsWith('https://') === false) required('APP_URL', 'https requis');
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
  readonly audit: {
    readonly enabled: boolean;
    readonly anchorEveryMinutes: number;
    readonly verifyEveryMinutes: number;
    /** Absent : aucun ancrage (local, aperçu). */
    readonly anchorBucket: string | undefined;
    /** Rétention du verrou posé sur chaque ancre ; 0 : aucun verrou. */
    readonly anchorLockDays: number;
  };
  readonly dataExport: {
    /** Absente : file `data-export` non consommée (local). */
    readonly encryptionKey: string | undefined;
    /** Cadence de l'expiration et du balayage des demandes. */
    readonly everyMinutes: number;
  };
  readonly accountDeletion: { readonly enabled: boolean; readonly everyMinutes: number };
  /** Absent : aucun email (local). */
  readonly smtp:
    | {
        readonly host: string;
        readonly port: number;
        readonly user: string | undefined;
        readonly password: string | undefined;
        readonly from: string;
        /** Origine du site web : lien vers l'espace du compte dans l'email. */
        readonly appUrl: string;
      }
    | undefined;
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
    audit: Object.freeze({
      enabled: value.AUDIT_MAINTENANCE_ENABLED,
      anchorEveryMinutes: value.AUDIT_ANCHOR_EVERY_MINUTES,
      verifyEveryMinutes: value.AUDIT_VERIFY_EVERY_MINUTES,
      anchorBucket: value.AUDIT_ANCHOR_BUCKET,
      anchorLockDays: value.AUDIT_ANCHOR_LOCK_DAYS,
    }),
    dataExport: Object.freeze({
      encryptionKey: value.DATABASE_ENCRYPTION_KEY,
      everyMinutes: value.DATA_EXPORT_EVERY_MINUTES,
    }),
    accountDeletion: Object.freeze({
      enabled: value.ACCOUNT_DELETION_ENABLED,
      everyMinutes: value.ACCOUNT_DELETION_EVERY_MINUTES,
    }),
    smtp:
      value.SMTP_HOST === undefined || value.EMAIL_FROM === undefined || value.APP_URL === undefined
        ? undefined
        : Object.freeze({
            host: value.SMTP_HOST,
            port: value.SMTP_PORT,
            user: value.SMTP_USER,
            password: value.SMTP_PASSWORD,
            from: value.EMAIL_FROM,
            appUrl: value.APP_URL,
          }),
  });
}
