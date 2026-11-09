import { anonymizeAccount, dueAccountDeletions, type AccountAnonymizeOutcome } from '@oz/db';
import { UnrecoverableError } from 'bullmq';
import type { SchedulerQueue } from './maintenance.js';
import type { ScanLogger } from './scan-document.js';
import type { WorkerEvents } from './worker.js';

// Suppression de compte (lot 1.16cba, EX-118 n° 3) : file `account-deletion`, un job planifié
// `anonymize-due` qui anonymise par lots les demandes échues (`oz_account_anonymize`, une demande
// par transaction). Pièces et archives, rendues échues, sont supprimées par leurs purges (lots
// 1.9cb et 1.16bb). Rien de personnel n'est journalisé : l'identifiant de la demande seul.

export const ACCOUNT_DELETION_QUEUE = 'account-deletion';
export const ACCOUNT_DELETION_JOB = 'anonymize-due';
/** Demandes traitées par passage. */
export const ACCOUNT_DELETION_BATCH = 100;

export interface AccountDeletionDependencies {
  listDue(limit: number): Promise<string[]>;
  anonymize(requestId: string): Promise<AccountAnonymizeOutcome>;
  logger: ScanLogger;
}

export interface AccountDeletionCounts {
  done: number;
  frozen: number;
  /** Annulée ou exécutée entre la désignation et le passage. */
  skipped: number;
  errors: number;
}

/** Type d'erreur seul, jamais son message. */
const causeOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/** Un passage : chaque demande échue, une à une ; une erreur n'arrête pas les autres. */
export async function anonymizeDueAccounts(
  deps: AccountDeletionDependencies,
): Promise<AccountDeletionCounts> {
  const counts: AccountDeletionCounts = { done: 0, frozen: 0, skipped: 0, errors: 0 };
  for (const requestId of await deps.listDue(ACCOUNT_DELETION_BATCH)) {
    try {
      const outcome = await deps.anonymize(requestId);
      if (outcome === 'done') counts.done += 1;
      else if (outcome === 'frozen') counts.frozen += 1;
      else counts.skipped += 1;
    } catch (error) {
      counts.errors += 1;
      deps.logger.warn({ requestId, cause: causeOf(error) }, 'account.deletion.failed');
    }
  }
  if (counts.frozen > 0) deps.logger.warn({ frozen: counts.frozen }, 'account.deletion.frozen');
  if (counts.done + counts.frozen + counts.skipped + counts.errors > 0) {
    deps.logger.info({ ...counts }, 'account.deletion.run');
  }
  return counts;
}

/** Aiguille le job planifié ; tout autre job est abandonné sans nouvel essai. */
export function createAccountDeletionProcessor(
  run: () => Promise<unknown>,
  logger: ScanLogger,
): (job: { readonly name: string; readonly data: unknown }) => Promise<unknown> {
  return async (job) => {
    const empty =
      typeof job.data === 'object' && job.data !== null && Object.keys(job.data).length === 0;
    if (job.name !== ACCOUNT_DELETION_JOB || !empty) {
      // Ni nom ni contenu journalisés : ils ne viennent pas d'une source de confiance.
      logger.error({}, 'account.deletion.invalid_job');
      throw new UnrecoverableError('job de suppression hors contrat');
    }
    return run();
  };
}

/** Pose (ou retire, si désactivée) la planification ; idempotent. */
export async function scheduleAccountDeletion(
  queue: SchedulerQueue,
  schedule: { readonly enabled: boolean; readonly everyMinutes: number },
): Promise<void> {
  if (!schedule.enabled) {
    await queue.removeJobScheduler(ACCOUNT_DELETION_JOB);
    return;
  }
  await queue.upsertJobScheduler(
    ACCOUNT_DELETION_JOB,
    { every: schedule.everyMinutes * 60_000 },
    {
      name: ACCOUNT_DELETION_JOB,
      data: {},
      opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    },
  );
}

/** Journalise les échecs : nom du job connu et type d'erreur seuls. */
export function observeAccountDeletion(worker: WorkerEvents, logger: ScanLogger): void {
  worker.on('failed', (job, error) => {
    const name = (job as { name?: string } | undefined)?.name;
    logger.warn(
      { job: name === ACCOUNT_DELETION_JOB ? name : undefined, cause: error.name },
      'account.deletion.attempt_failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ cause: error.name }, 'account.deletion.error');
  });
}

/** Câblage sur la base du worker (`oz_worker`). */
export function createAccountDeletionDependencies(deps: {
  db: Parameters<typeof anonymizeAccount>[0];
  logger: ScanLogger;
}): AccountDeletionDependencies {
  const { db } = deps;
  return {
    listDue: (limit) => dueAccountDeletions(db, limit),
    anonymize: (id) => anonymizeAccount(db, id),
    logger: deps.logger,
  };
}
