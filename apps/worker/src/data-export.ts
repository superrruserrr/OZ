import { dataExportJobSchema } from '@oz/contracts';
import {
  claimDataExport,
  expireDataExport,
  failDataExport,
  finishDataExport,
  listDueDataExports,
  personalDataExport,
  type DataExportFailure,
  type DataExportTransition,
  type DueDataExport,
  type PersonalDataExport,
} from '@oz/db';
import { exportKey } from '@oz/storage';
import { UnrecoverableError } from 'bullmq';
import type { SchedulerQueue } from './maintenance.js';
import type { ScanLogger } from './scan-document.js';
import type { WorkerEvents } from './worker.js';

// Export des données personnelles (lot 1.16bb) : file `data-export`. `build-export` (une demande,
// mise en file par l'API) prend la demande en base, assemble le JSON, l'écrit sous
// `exports/<demande>.json`, marque la demande prête puis envoie l'email « archive prête ».
// `maintain-exports` (planifié) supprime les archives échues, remet en file les demandes sans
// nouvelle depuis 30 minutes et abandonne celles de plus de 24 heures. Rien de personnel n'est
// journalisé : ni contenu, ni adresse, ni identifiant de compte ou de joueur.

/** Nom de la file et du job, identiques au producteur de l'API (`apps/api/src/privacy/export-queue.ts`). */
export const DATA_EXPORT_QUEUE = 'data-export';
export const DATA_EXPORT_JOB = 'build-export';
export const DATA_EXPORT_MAINTENANCE_JOB = 'maintain-exports';
/** Demandes traitées par passage de maintenance. */
export const DATA_EXPORT_BATCH = 100;

/** Options du producteur de l'API, à garder identiques (D6 : 3 essais). */
export const DATA_EXPORT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const;

export interface DataExportDependencies {
  claim(requestId: string): Promise<string | null>;
  /** JSON du compte (`oz_personal_data_export`), `null` s'il n'existe plus. */
  build(userId: string): Promise<PersonalDataExport | null>;
  finish(requestId: string): Promise<DataExportTransition | 'account_gone'>;
  fail(requestId: string, reason: DataExportFailure): Promise<DataExportTransition>;
  storage: {
    putExport(key: string, body: Uint8Array): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** Email « archive prête » ; absent : aucun email (local sans SMTP). */
  notify: ((to: string) => Promise<void>) | undefined;
  logger: ScanLogger;
}

export type DataExportOutcome = 'ready' | 'skipped' | 'failed';

/** Ce que le processeur lit d'un job BullMQ. */
export interface DataExportJob {
  readonly name: string;
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly opts: { readonly attempts?: number | undefined };
}

/** Type d'erreur seul, jamais son message (clé, contenu, adresse). */
export const causeOf = (error: unknown): string =>
  error instanceof Error ? error.name : 'unknown';

/** Adresse du compte, lue dans l'export lui-même (déchiffrée par la base). */
function accountEmail(data: PersonalDataExport): string | null {
  const account = (data as { account?: { email?: unknown } }).account;
  return typeof account?.email === 'string' ? account.email : null;
}

/**
 * Retire l'archive d'une demande close, jamais d'une demande `ready` (exécution en double, course
 * avec la maintenance) ; un échec est journalisé par son type, la maintenance n'y repassera pas.
 */
async function discard(
  deps: { storage: { remove(key: string): Promise<void> }; logger: ScanLogger },
  requestId: string,
): Promise<void> {
  try {
    await deps.storage.remove(exportKey(requestId));
  } catch (error) {
    deps.logger.error({ requestId, cause: causeOf(error) }, 'data.export.remove_failed');
  }
}

export async function buildDataExport(
  deps: DataExportDependencies,
  requestId: string,
  options: { readonly lastAttempt: boolean },
): Promise<DataExportOutcome> {
  const key = exportKey(requestId);
  let data: PersonalDataExport | null;
  try {
    const owner = await deps.claim(requestId);
    if (owner === null) {
      deps.logger.info({ requestId }, 'data.export.skipped');
      return 'skipped';
    }
    data = await deps.build(owner);
    if (data === null) {
      await deps.fail(requestId, 'account_gone');
      deps.logger.warn({ requestId, reason: 'account_gone' }, 'data.export.failed');
      return 'failed';
    }
    await deps.storage.putExport(key, new TextEncoder().encode(JSON.stringify(data)));
    const finished = await deps.finish(requestId);
    if (finished === 'account_gone') {
      await discard(deps, requestId);
      deps.logger.warn({ requestId, reason: 'account_gone' }, 'data.export.failed');
      return 'failed';
    }
    if (finished !== 'done') {
      // Déjà prête (exécution en double) : l'archive est la bonne. Close entre-temps : retirée.
      if (finished !== 'ready') await discard(deps, requestId);
      deps.logger.info({ requestId }, 'data.export.skipped');
      return 'skipped';
    }
  } catch (error) {
    if (options.lastAttempt) {
      try {
        if ((await deps.fail(requestId, 'build_failed')) !== 'ready') {
          await discard(deps, requestId);
        }
        deps.logger.warn({ requestId, reason: 'build_failed' }, 'data.export.failed');
      } catch (failError) {
        // L'erreur d'origine reste celle du job ; le balayage abandonnera la demande après 24 h.
        deps.logger.error({ requestId, cause: causeOf(failError) }, 'data.export.fail_failed');
      }
    }
    throw error;
  }
  deps.logger.info({ requestId }, 'data.export.ready');
  // Email envoyé une fois, après la fin : un échec SMTP ne rejoue pas l'archive.
  const to = accountEmail(data);
  if (deps.notify !== undefined && to !== null) {
    try {
      await deps.notify(to);
    } catch (error) {
      deps.logger.warn({ requestId, cause: causeOf(error) }, 'data.export.mail_failed');
    }
  }
  return 'ready';
}

/** Ce que la remise en file lit de la file `data-export` (BullMQ `Queue`). */
export interface DataExportQueue {
  getJob(id: string): Promise<
    | {
        getState(): Promise<string>;
        retry(
          state: 'failed' | 'completed',
          options: { resetAttemptsMade: boolean; resetAttemptsStarted: boolean },
        ): Promise<void>;
      }
    | undefined
  >;
  add(
    name: string,
    data: { requestId: string },
    options: typeof DATA_EXPORT_JOB_OPTIONS & { jobId: string },
  ): Promise<unknown>;
}

export interface DataExportMaintenanceDependencies {
  listDue(limit: number): Promise<DueDataExport[]>;
  expire(requestId: string): Promise<boolean>;
  fail(requestId: string, reason: DataExportFailure): Promise<DataExportTransition>;
  storage: { remove(key: string): Promise<void> };
  queue: DataExportQueue;
  logger: ScanLogger;
}

/**
 * Un passage : archive échue supprimée puis demande `expired` (l'objet d'abord, pour qu'aucune
 * archive ne survive à sa demande) ; demande sans nouvelle remise en file (ou rejouée si son job a
 * échoué) ; demande de plus de 24 heures abandonnée. Une erreur sur une demande n'arrête pas les
 * autres ; le passage suivant la reprend.
 */
export async function maintainDataExports(
  deps: DataExportMaintenanceDependencies,
): Promise<{ expired: number; requeued: number; failed: number; errors: number }> {
  const counts = { expired: 0, requeued: 0, failed: 0, errors: 0 };
  for (const { id, action } of await deps.listDue(DATA_EXPORT_BATCH)) {
    try {
      if (action === 'expire') {
        await deps.storage.remove(exportKey(id));
        if (await deps.expire(id)) counts.expired += 1;
      } else if (action === 'fail') {
        // Prête entre la désignation et l'abandon : l'archive est gardée.
        const outcome = await deps.fail(id, 'abandoned');
        if (outcome === 'done') counts.failed += 1;
        if (outcome !== 'ready') await deps.storage.remove(exportKey(id));
      } else {
        const job = await deps.queue.getJob(id);
        const state = job === undefined ? undefined : await job.getState();
        if (job !== undefined && (state === 'failed' || state === 'completed')) {
          await job.retry(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
        } else if (job === undefined) {
          await deps.queue.add(
            DATA_EXPORT_JOB,
            { requestId: id },
            { ...DATA_EXPORT_JOB_OPTIONS, jobId: id },
          );
        }
        counts.requeued += 1;
      }
    } catch (error) {
      counts.errors += 1;
      deps.logger.warn(
        { requestId: id, action, cause: causeOf(error) },
        'data.export.maintenance_failed',
      );
    }
  }
  if (counts.expired + counts.requeued + counts.failed + counts.errors > 0) {
    deps.logger.info(counts, 'data.export.maintained');
  }
  return counts;
}

/** Aiguille un job ; un job hors contrat est abandonné sans nouvel essai. */
export function createDataExportProcessor(
  deps: DataExportDependencies,
  maintenance: () => Promise<unknown>,
): (job: DataExportJob) => Promise<unknown> {
  return async (job) => {
    if (job.name === DATA_EXPORT_MAINTENANCE_JOB) {
      const empty =
        typeof job.data === 'object' && job.data !== null && Object.keys(job.data).length === 0;
      if (empty) return maintenance();
    }
    const message = dataExportJobSchema.safeParse(job.data);
    if (job.name !== DATA_EXPORT_JOB || !message.success) {
      // Contenu du message non journalisé : il ne vient pas d'une source de confiance.
      deps.logger.error({}, 'data.export.invalid_job');
      throw new UnrecoverableError('message hors contrat');
    }
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    return buildDataExport(deps, message.data.requestId, { lastAttempt });
  };
}

/** Pose (ou retire, sans clé de chiffrement) la maintenance planifiée ; idempotent. */
export async function scheduleDataExportMaintenance(
  queue: SchedulerQueue,
  schedule: { readonly enabled: boolean; readonly everyMinutes: number },
): Promise<void> {
  if (!schedule.enabled) {
    await queue.removeJobScheduler(DATA_EXPORT_MAINTENANCE_JOB);
    return;
  }
  await queue.upsertJobScheduler(
    DATA_EXPORT_MAINTENANCE_JOB,
    { every: schedule.everyMinutes * 60_000 },
    {
      name: DATA_EXPORT_MAINTENANCE_JOB,
      data: {},
      opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    },
  );
}

/** Journalise les échecs : nom du job connu et type d'erreur seuls. */
export function observeDataExport(worker: WorkerEvents, logger: ScanLogger): void {
  worker.on('failed', (job, error) => {
    const name = (job as { name?: string } | undefined)?.name;
    const known = name === DATA_EXPORT_JOB || name === DATA_EXPORT_MAINTENANCE_JOB;
    logger.warn(
      { job: known ? name : undefined, attemptsMade: job?.attemptsMade, cause: error.name },
      'data.export.attempt_failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ cause: error.name }, 'data.export.error');
  });
}

/** Câblage sur la base du worker (`oz_worker`). */
export function createDataExportDependencies(deps: {
  db: Parameters<typeof claimDataExport>[0];
  encryptionKey: string;
  storage: DataExportDependencies['storage'];
  mailer: { sendDataExportReady(to: string): Promise<void> } | undefined;
  logger: ScanLogger;
}): DataExportDependencies {
  const { db, mailer } = deps;
  return {
    claim: (id) => claimDataExport(db, id),
    build: (userId) => personalDataExport(db, userId, deps.encryptionKey),
    finish: (id) => finishDataExport(db, id),
    fail: (id, reason) => failDataExport(db, id, reason),
    storage: deps.storage,
    notify: mailer === undefined ? undefined : (to) => mailer.sendDataExportReady(to),
    logger: deps.logger,
  };
}

export function createDataExportMaintenanceDependencies(deps: {
  db: Parameters<typeof listDueDataExports>[0];
  storage: DataExportMaintenanceDependencies['storage'];
  queue: DataExportQueue;
  logger: ScanLogger;
}): DataExportMaintenanceDependencies {
  const { db } = deps;
  return {
    listDue: (limit) => listDueDataExports(db, limit),
    expire: (id) => expireDataExport(db, id),
    fail: (id, reason) => failDataExport(db, id, reason),
    storage: deps.storage,
    queue: deps.queue,
    logger: deps.logger,
  };
}
