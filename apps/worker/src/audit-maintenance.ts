import {
  auditChainHead,
  checkAuditChain,
  maintainAuditPartitions,
  type AuditCheck,
  type AuditHead,
  type AuditPartitions,
} from '@oz/db';
import type { AuditAnchorStore } from '@oz/storage';
import { UnrecoverableError } from 'bullmq';
import type { SchedulerQueue } from './maintenance.js';
import type { ScanLogger } from './scan-document.js';
import type { WorkerEvents } from './worker.js';

// Journal d'audit (lot 1.16a) : une file `audit-maintenance`, trois jobs planifiés sans données,
// consommés un à la fois. Partitions du mois courant et des trois suivants (D-057) ; tête de chaîne
// ancrée hors de la base dans un bucket verrouillé, après vérification (D-060) ; chaîne vérifiée contre la dernière ancre,
// résultat consigné par la base (CP-23). Les alertes ne portent que des positions et des comptes.

export const AUDIT_MAINTENANCE_QUEUE = 'audit-maintenance';
export const AUDIT_JOBS = ['maintain-partitions', 'anchor-head', 'verify-chain'] as const;
export type AuditJob = (typeof AUDIT_JOBS)[number];
export type AuditHandlers = Record<AuditJob, () => Promise<unknown>>;

/** Partitions : une fois par jour. */
const PARTITIONS_EVERY_MINUTES = 1_440;

export interface AuditDependencies {
  maintainPartitions(): Promise<AuditPartitions>;
  head(): Promise<AuditHead>;
  check(anchor: AuditHead | null): Promise<AuditCheck>;
  /** Absent sans bucket d'ancres (local, aperçu) : pas d'ancrage, chaîne vérifiée seule. */
  anchors: Pick<AuditAnchorStore, 'latest' | 'put'> | undefined;
  logger: ScanLogger;
}

/** Les appels à la base (rôle `oz_worker`), branchés. */
export function createAuditDependencies(deps: {
  db: Parameters<typeof maintainAuditPartitions>[0];
  anchors: AuditDependencies['anchors'];
  logger: ScanLogger;
}): AuditDependencies {
  const { db } = deps;
  return {
    maintainPartitions: () => maintainAuditPartitions(db),
    head: () => auditChainHead(db),
    check: (anchor) => checkAuditChain(db, anchor),
    anchors: deps.anchors,
    logger: deps.logger,
  };
}

export function createAuditHandlers(deps: AuditDependencies): AuditHandlers {
  const { logger } = deps;
  return {
    'maintain-partitions': async () => {
      const result = await deps.maintainPartitions();
      if (result.defaultRows > 0) {
        logger.error({ defaultRows: result.defaultRows }, 'audit.partition.default_used');
      }
      if (result.failedMonths > 0) {
        logger.error(
          { failedMonths: result.failedMonths, code: result.errorCode },
          'audit.partition.failed',
        );
      }
      logger.info(
        { defaultRows: result.defaultRows, failedMonths: result.failedMonths },
        'audit.partition.done',
      );
      return result;
    },
    'anchor-head': async () => {
      const { anchors } = deps;
      if (anchors === undefined) {
        logger.info({}, 'audit.anchor.disabled');
        return 'disabled';
      }
      const head = await deps.head();
      if (head.position === 0) return 'empty';
      const latest = await anchors.latest();
      if (latest !== null && latest.position > head.position) {
        // Chaîne plus courte que l'ancre : la vérification le consignera en défaut.
        logger.error(
          { anchorPosition: latest.position, headPosition: head.position },
          'audit.anchor.ahead',
        );
        return 'ahead';
      }
      if (latest !== null && latest.position === head.position) return 'unchanged';
      // Jamais d'ancre sur une chaîne en défaut : une réécriture complète serait « blanchie » par
      // l'ancre suivante. Tête lue avant la vérification : réécrite entre les deux, la tête ancrée
      // (légitime) contredira la chaîne à la vérification suivante.
      const check = await deps.check(latest);
      if (check.defectPosition !== null) {
        logger.error(
          { defectPosition: check.defectPosition, headPosition: check.headPosition },
          'audit.anchor.refused',
        );
        return 'refused';
      }
      const outcome = await anchors.put(head);
      logger.info({ position: head.position }, `audit.anchor.${outcome}`);
      return outcome;
    },
    'verify-chain': async () => {
      let anchor: AuditHead | null = null;
      if (deps.anchors !== undefined) {
        try {
          anchor = await deps.anchors.latest();
        } catch (error) {
          // Jamais de repli « sans ancre » : il masquerait une réécriture complète de la chaîne.
          logger.error(
            { cause: error instanceof Error ? error.name : 'inconnue' },
            'audit.anchor.unreadable',
          );
          throw error;
        }
      }
      const check = await deps.check(anchor);
      if (check.defectPosition === null) {
        logger.info(
          { headPosition: check.headPosition, anchorPosition: check.anchorPosition },
          'audit.chain.verified',
        );
      } else {
        logger.error(
          { defectPosition: check.defectPosition, headPosition: check.headPosition },
          'audit.chain.broken',
        );
      }
      return check;
    },
  };
}

/** Aiguille un job vers son traitement ; un job inconnu ou porteur de données est abandonné. */
export function createAuditProcessor(
  handlers: AuditHandlers,
  logger: ScanLogger,
): (job: { readonly name: string; readonly data: unknown }) => Promise<unknown> {
  return async (job) => {
    const known = (AUDIT_JOBS as readonly string[]).includes(job.name);
    const empty =
      typeof job.data === 'object' && job.data !== null && Object.keys(job.data).length === 0;
    if (!known || !empty) {
      logger.error({}, 'audit.maintenance.invalid_job');
      throw new UnrecoverableError("job d'audit hors contrat");
    }
    return handlers[job.name as AuditJob]();
  };
}

export interface AuditSchedule {
  readonly enabled: boolean;
  readonly anchorEveryMinutes: number;
  readonly verifyEveryMinutes: number;
  /** Faux sans bucket d'ancres : la planification de l'ancrage est retirée. */
  readonly anchoring: boolean;
}

/** Pose ou retire les trois planifications ; idempotent (identifiants fixes). */
export async function scheduleAuditMaintenance(
  queue: SchedulerQueue,
  schedule: AuditSchedule,
): Promise<void> {
  const every: Record<AuditJob, number> = {
    'maintain-partitions': PARTITIONS_EVERY_MINUTES,
    'anchor-head': schedule.anchorEveryMinutes,
    'verify-chain': schedule.verifyEveryMinutes,
  };
  for (const name of AUDIT_JOBS) {
    if (!schedule.enabled || (name === 'anchor-head' && !schedule.anchoring)) {
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

/** Journalise les échecs : nom du job (s'il est l'un des trois) et type d'erreur seuls. */
export function observeAuditMaintenance(worker: WorkerEvents, logger: ScanLogger): void {
  worker.on('failed', (job, error) => {
    const name = (job as { name?: string } | undefined)?.name;
    const known = (AUDIT_JOBS as readonly (string | undefined)[]).includes(name);
    logger.warn({ job: known ? name : undefined, cause: error.name }, 'audit.maintenance.failed');
  });
  worker.on('error', (error) => {
    logger.error({ cause: error.name }, 'audit.maintenance.error');
  });
}
