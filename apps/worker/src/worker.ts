import { ConfigError, loadWorkerConfig, redisTlsOptions, type WorkerConfig } from '@oz/config';
import { claimDocumentScan, createDbClient, finishDocumentScan } from '@oz/db';
import { AuditAnchorStore, DocumentStorage } from '@oz/storage';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import {
  AUDIT_MAINTENANCE_QUEUE,
  createAuditDependencies,
  createAuditHandlers,
  createAuditProcessor,
  observeAuditMaintenance,
  scheduleAuditMaintenance,
} from './audit-maintenance.js';
import { ClamavClient } from './clamav.js';
import { HEALTH_PORT, startHealthServer } from './health.js';
import {
  DOCUMENT_MAINTENANCE_QUEUE,
  createMaintenanceHandlers,
  createMaintenanceProcessor,
  observeMaintenance,
  scheduleMaintenance,
} from './maintenance.js';
import { DOCUMENT_SCAN_QUEUE, createScanProcessor } from './processor.js';
import type { ScanLogger } from './scan-document.js';

// Démarrage du worker (lot 1.9b) : base sous le rôle `oz_worker`, Redis, stockage, ClamAV, puis
// consommation de la file `document-scan`. Lot 1.9cb : file `document-maintenance` (purge des pièces
// échues, balayage des analyses abandonnées, objets orphelins), planifiée au démarrage. Lot 1.16a :
// file `audit-maintenance` (partitions, ancrage de la tête de chaîne, vérification). Arrêt propre
// sur SIGTERM/SIGINT : les traitements en cours se terminent, les connexions sont fermées.

export interface WorkerHandle {
  /** Vrai tant que le worker consomme la file et que Redis est connecté. */
  readonly healthy: () => boolean;
  close(): Promise<void>;
}

/** Démarre la consommation de la file ; résout une fois le worker connecté à Redis. */
export async function startWorker(config: WorkerConfig, logger: ScanLogger): Promise<WorkerHandle> {
  const db = createDbClient(config.databaseUrl, config.databaseCaCert);
  // BullMQ exige `maxRetriesPerRequest: null` pour une connexion bloquante de worker.
  const connection = new Redis(config.redisUrl, {
    ...redisTlsOptions(config.redisUrl, config.redisCaCert),
    maxRetriesPerRequest: null,
  });
  const storage = new DocumentStorage(config.s3);
  const clamav = new ClamavClient(config.clamav);
  const processor = createScanProcessor({
    claim: (id) => claimDocumentScan(db, id),
    finish: (id, verdict) => finishDocumentScan(db, id, verdict),
    storage,
    clamav,
    logger,
  });
  const worker = new Worker(DOCUMENT_SCAN_QUEUE, processor, {
    connection,
    concurrency: config.concurrency,
  });
  observe(worker, logger);

  // Maintenance : un traitement à la fois ; le balayage remet en file sur `document-scan`.
  const scanQueue = new Queue(DOCUMENT_SCAN_QUEUE, { connection });
  const maintenanceQueue = new Queue(DOCUMENT_MAINTENANCE_QUEUE, { connection });
  const maintenance = new Worker(
    DOCUMENT_MAINTENANCE_QUEUE,
    createMaintenanceProcessor(
      createMaintenanceHandlers({ db, storage, scanQueue, logger }),
      logger,
    ),
    { connection, concurrency: 1 },
  );
  observeMaintenance(maintenance, logger);

  // Journal d'audit : ancres dans leur propre bucket (même clé d'application), s'il est configuré.
  const anchorBucket = config.audit.anchorBucket;
  const anchors =
    anchorBucket === undefined
      ? undefined
      : new AuditAnchorStore({
          ...config.s3,
          bucket: anchorBucket,
          lockDays: config.audit.anchorLockDays,
        });
  const auditQueue = new Queue(AUDIT_MAINTENANCE_QUEUE, { connection });
  const audit = new Worker(
    AUDIT_MAINTENANCE_QUEUE,
    createAuditProcessor(
      createAuditHandlers(createAuditDependencies({ db, anchors, logger })),
      logger,
    ),
    { connection, concurrency: 1 },
  );
  observeAuditMaintenance(audit, logger);

  await Promise.all([
    worker.waitUntilReady(),
    maintenance.waitUntilReady(),
    audit.waitUntilReady(),
  ]);
  await scheduleMaintenance(maintenanceQueue, config.maintenance);
  await scheduleAuditMaintenance(auditQueue, {
    enabled: config.audit.enabled,
    anchorEveryMinutes: config.audit.anchorEveryMinutes,
    verifyEveryMinutes: config.audit.verifyEveryMinutes,
    anchoring: anchors !== undefined,
  });
  logger.info(
    {
      concurrency: config.concurrency,
      maintenance: config.maintenance.enabled,
      audit: config.audit.enabled,
      anchoring: anchors !== undefined,
    },
    'worker.started',
  );
  return {
    healthy: () =>
      worker.isRunning() &&
      maintenance.isRunning() &&
      audit.isRunning() &&
      connection.status === 'ready',
    async close() {
      await Promise.all([worker.close(), maintenance.close(), audit.close()]);
      await Promise.allSettled([scanQueue.close(), maintenanceQueue.close(), auditQueue.close()]);
      anchors?.destroy();
      await Promise.allSettled([db.$disconnect(), connection.quit()]);
    },
  };
}

/** Ce que `observe` écoute d'un worker BullMQ. */
export interface WorkerEvents {
  on(
    event: 'failed',
    listener: (
      job: { id?: string | undefined; attemptsMade: number } | undefined,
      error: Error,
    ) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/** Journalise les échecs : seul le type d'erreur, jamais son message (clé, contenu, adresse). */
export function observe(worker: WorkerEvents, logger: ScanLogger): void {
  // Échec d'un essai : le job est rejoué par BullMQ jusqu'au dernier.
  worker.on('failed', (job, error) => {
    logger.warn(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, cause: error.name },
      'document.scan.attempt_failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ cause: error.name }, 'worker.error');
  });
}

/** Ce que l'arrêt lit du processus (remplaçable en test). */
export interface SignalTarget {
  once(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  exit(code: number): void;
}

/** Arrête proprement au premier SIGTERM ou SIGINT ; un second signal pendant l'arrêt est ignoré. */
export function stopOnSignals(
  handle: Pick<WorkerHandle, 'close'>,
  logger: Pick<ScanLogger, 'info' | 'error'>,
  target: SignalTarget,
): void {
  let stopping = false;
  const stop = (signal: 'SIGTERM' | 'SIGINT'): void => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'worker.stopping');
    handle.close().then(
      () => {
        target.exit(0);
      },
      (error: unknown) => {
        logger.error(
          { cause: error instanceof Error ? error.name : 'inconnue' },
          'worker.stop_failed',
        );
        target.exit(1);
      },
    );
  };
  target.once('SIGTERM', () => {
    stop('SIGTERM');
  });
  target.once('SIGINT', () => {
    stop('SIGINT');
  });
}

/** Journal JSON du worker, au niveau configuré. */
export function createLogger(config: WorkerConfig): ScanLogger {
  return pino({ level: config.logLevel, base: { service: 'oz-worker', env: config.appEnv } });
}

/** Démarre le worker, sa sonde de vivacité, et installe l'arrêt sur signal. */
export async function serve(
  config: WorkerConfig,
  target: SignalTarget,
  healthPort = HEALTH_PORT,
): Promise<WorkerHandle> {
  const logger = createLogger(config);
  const worker = await startWorker(config, logger);
  const health = await startHealthServer(worker.healthy, healthPort);
  const handle: WorkerHandle = {
    healthy: worker.healthy,
    async close() {
      await health.close();
      await worker.close();
    },
  };
  stopOnSignals(handle, logger, target);
  return handle;
}

interface MainIo {
  readonly stderr: (text: string) => void;
  readonly start: (config: WorkerConfig) => Promise<unknown>;
}

/** Valide la configuration puis démarre ; code de sortie non nul au lieu de démarrer mal configuré. */
export async function runMain(
  env: Readonly<Record<string, string | undefined>>,
  io: MainIo,
): Promise<number> {
  let config: WorkerConfig;
  try {
    config = loadWorkerConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      io.stderr(`✖ ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  try {
    await io.start(config);
  } catch (error) {
    // Le message peut porter une adresse ou un identifiant (URL Redis, base) : type seul.
    io.stderr(`✖ Démarrage impossible (${error instanceof Error ? error.name : 'inconnue'})\n`);
    return 1;
  }
  return 0;
}
