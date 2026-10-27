import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { pgConnectionOptions, redisTlsOptions, type ApiConfig } from '@oz/config';
import { Redis } from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import pg from 'pg';
import { API_CONFIG } from '../config/config.module.js';

export type CheckState = 'up' | 'down';
export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly checks: {
    readonly database: CheckState;
    readonly redis: CheckState;
    readonly storage: CheckState;
  };
}

const CHECK_TIMEOUT_MS = 2_000;
/** Durée pendant laquelle un résultat est réutilisé : limite l'amplification d'un endpoint public. */
const CACHE_MS = 2_000;

interface PgClientInternals {
  connection?: { stream?: { destroy(): void } };
}

const ignore = (): void => undefined;

/**
 * Sondes des dépendances : parallèles, bornées à 2 s, sans jamais exposer la cause d'un échec.
 * Chaque sonde ouvre sa propre connexion et la ferme : une connexion bloquée par un incident réseau
 * ne peut pas fausser les sondes suivantes ni bloquer l'arrêt de l'application.
 */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly s3: S3Client;
  private inflight: Promise<HealthReport> | undefined;
  private cached: { readonly at: number; readonly report: HealthReport } | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @InjectPinoLogger(HealthService.name) private readonly logger: PinoLogger,
  ) {
    this.s3 = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
      maxAttempts: 1,
    });
  }

  /** Appels simultanés : une seule série de sondes ; résultat réutilisé pendant CACHE_MS. */
  check(): Promise<HealthReport> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS)
      return Promise.resolve(this.cached.report);
    this.inflight ??= this.runChecks()
      .then((report) => {
        this.cached = { at: Date.now(), report };
        return report;
      })
      .finally(() => {
        this.inflight = undefined;
      });
    return this.inflight;
  }

  private async runChecks(): Promise<HealthReport> {
    const [database, redis, storage] = await Promise.all([
      this.probe('database', () => this.checkDatabase()),
      this.probe('redis', () => this.checkRedis()),
      this.probe('storage', (signal) =>
        this.s3.send(new HeadBucketCommand({ Bucket: this.config.s3.bucket }), {
          abortSignal: signal,
        }),
      ),
    ]);
    return {
      status: [database, redis, storage].every((state) => state === 'up') ? 'ok' : 'degraded',
      checks: { database, redis, storage },
    };
  }

  private async checkDatabase(): Promise<void> {
    const client = new pg.Client({
      ...pgConnectionOptions(this.config.databaseUrl, this.config.databaseCaCert),
      connectionTimeoutMillis: CHECK_TIMEOUT_MS,
      query_timeout: CHECK_TIMEOUT_MS,
    });
    client.on('error', ignore);
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      // Fermeture polie, puis coupure franche si le réseau ne répond plus.
      const socket = (client as unknown as PgClientInternals).connection?.stream;
      client.end().catch(ignore);
      setTimeout(() => socket?.destroy(), 500).unref();
    }
  }

  private async checkRedis(): Promise<void> {
    const redis = new Redis(this.config.redisUrl, {
      ...redisTlsOptions(this.config.redisUrl, this.config.redisCaCert),
      lazyConnect: true,
      connectTimeout: CHECK_TIMEOUT_MS,
      commandTimeout: CHECK_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', ignore);
    try {
      await redis.connect();
      await redis.ping();
    } finally {
      redis.disconnect();
    }
  }

  private async probe(
    name: string,
    run: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<CheckState> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`délai de ${String(CHECK_TIMEOUT_MS)} ms dépassé`));
      }, CHECK_TIMEOUT_MS);
      timer.unref();
    });
    const attempt = run(controller.signal);
    attempt.catch(ignore); // un échec tardif après le délai est déjà compté comme « down »
    try {
      await Promise.race([attempt, timeout]);
      return 'up';
    } catch (error) {
      this.logger.warn({ err: error, check: name }, 'dépendance indisponible');
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}
