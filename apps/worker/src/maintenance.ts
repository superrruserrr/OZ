import { UnrecoverableError } from 'bullmq';
import type { WorkerEvents } from './worker.js';
import type { ScanLogger } from './scan-document.js';

// Maintenance du coffre (lot 1.9cb) : une file `document-maintenance`, trois jobs planifiés par
// BullMQ (identifiants fixes : un seul planificateur quel que soit le nombre de workers), consommés
// un à la fois. Les jobs ne portent aucune donnée ; tout est relu en base.

export const DOCUMENT_MAINTENANCE_QUEUE = 'document-maintenance';
export const MAINTENANCE_JOBS = ['purge-due', 'sweep-pending', 'purge-orphans'] as const;
export type MaintenanceJob = (typeof MAINTENANCE_JOBS)[number];
/** Documents traités par exécution de purge et de balayage (D5). */
export const MAINTENANCE_BATCH = 100;

export type MaintenanceHandlers = Record<MaintenanceJob, () => Promise<unknown>>;

/** Aiguille un job vers son traitement ; un job inconnu ou porteur de données est abandonné. */
export function createMaintenanceProcessor(
  handlers: MaintenanceHandlers,
  logger: ScanLogger,
): (job: { readonly name: string; readonly data: unknown }) => Promise<unknown> {
  return async (job) => {
    const known = (MAINTENANCE_JOBS as readonly string[]).includes(job.name);
    const empty =
      typeof job.data === 'object' && job.data !== null && Object.keys(job.data).length === 0;
    if (!known || !empty) {
      // Ni nom ni contenu journalisés : ils ne viennent pas d'une source de confiance.
      logger.error({}, 'document.maintenance.invalid_job');
      throw new UnrecoverableError('job de maintenance hors contrat');
    }
    return handlers[job.name as MaintenanceJob]();
  };
}

/** Ce que la planification lit d'une file BullMQ (`Queue`). */
export interface SchedulerQueue {
  upsertJobScheduler(
    id: string,
    repeat: { every: number },
    template: {
      name: string;
      data: Record<string, never>;
      opts: { attempts: number; removeOnComplete: number; removeOnFail: number };
    },
  ): Promise<unknown>;
  removeJobScheduler(id: string): Promise<unknown>;
}

export interface MaintenanceSchedule {
  readonly enabled: boolean;
  readonly purgeEveryMinutes: number;
  readonly orphansEveryMinutes: number;
}

/**
 * Pose (ou retire, si désactivée) les trois planifications. Idempotent : un redémarrage ou un
 * second worker remplace la planification au lieu d'en ajouter une. Un échec n'est pas rejoué :
 * l'exécution suivante reprend le travail.
 */
export async function scheduleMaintenance(
  queue: SchedulerQueue,
  schedule: MaintenanceSchedule,
): Promise<void> {
  const every: Record<MaintenanceJob, number> = {
    'purge-due': schedule.purgeEveryMinutes,
    'sweep-pending': schedule.purgeEveryMinutes,
    'purge-orphans': schedule.orphansEveryMinutes,
  };
  for (const name of MAINTENANCE_JOBS) {
    if (!schedule.enabled) {
      await queue.removeJobScheduler(name);
      continue;
    }
    await queue.upsertJobScheduler(
      name,
      { every: every[name] * 60_000 },
      { name, data: {}, opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 } },
    );
  }
}

/** Journalise les échecs de maintenance : nom du job et type d'erreur seuls. */
export function observeMaintenance(worker: WorkerEvents, logger: ScanLogger): void {
  worker.on('failed', (job, error) => {
    // Nom repris seulement s'il est l'un des trois : un job hors contrat n'est pas de confiance.
    const name = (job as { name?: string } | undefined)?.name;
    const known = (MAINTENANCE_JOBS as readonly (string | undefined)[]).includes(name);
    logger.warn(
      { job: known ? name : undefined, cause: error.name },
      'document.maintenance.failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ cause: error.name }, 'document.maintenance.error');
  });
}
