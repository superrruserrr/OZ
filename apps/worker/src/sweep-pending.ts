import type { ScanVerdict, StalePending } from '@oz/db';
import { DOCUMENT_SCAN_JOB } from './processor.js';
import type { ScanLogger } from './scan-document.js';

// Analyses abandonnées (lot 1.9cb, D-099) : un job abandonné par BullMQ après des blocages répétés
// échoue sans passer par le processeur, et le document reste `pending`. Après 30 minutes, le job est
// remis en file (ou rejoué s'il a échoué) ; après 24 heures, le document passe `error` (jamais servi).

/** Options du producteur de l'API (`apps/api/src/document/scan-queue.ts`), à garder identiques. */
export const SCAN_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const;

/** Ce que le balayage lit de la file `document-scan` (BullMQ `Queue`). */
export interface ScanQueue {
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
    data: { documentId: string },
    options: typeof SCAN_JOB_OPTIONS & { jobId: string },
  ): Promise<unknown>;
}

export interface SweepDependencies {
  listStale(limit: number): Promise<StalePending[]>;
  finish(documentId: string, verdict: ScanVerdict): Promise<'done' | 'skipped'>;
  queue: ScanQueue;
  logger: ScanLogger;
}

export interface SweepSummary {
  readonly requeued: number;
  readonly failed: number;
  readonly errors: number;
}

/** Relance ou clôt un lot d'analyses abandonnées ; une erreur sur l'une n'interrompt pas les autres. */
export async function sweepPending(deps: SweepDependencies, limit: number): Promise<SweepSummary> {
  let requeued = 0;
  let failed = 0;
  let errors = 0;
  for (const { id, action } of await deps.listStale(limit)) {
    try {
      if (action === 'fail') {
        if ((await deps.finish(id, { verdict: 'error' })) === 'done') {
          failed += 1;
          deps.logger.error({ documentId: id }, 'document.scan.stalled');
        }
      } else if (await requeue(deps.queue, id)) {
        requeued += 1;
        deps.logger.warn({ documentId: id }, 'document.scan.requeued');
      }
    } catch (error) {
      errors += 1;
      deps.logger.warn(
        { documentId: id, cause: error instanceof Error ? error.name : 'inconnue' },
        'document.scan.sweep_failed',
      );
    }
  }
  deps.logger.info({ requeued, failed, errors }, 'document.scan.sweep_done');
  return { requeued, failed, errors };
}

/** Vrai si le job a été remis en file ; faux s'il attend ou tourne déjà. */
async function requeue(queue: ScanQueue, documentId: string): Promise<boolean> {
  const job = await queue.getJob(documentId);
  if (job === undefined) {
    await queue.add(DOCUMENT_SCAN_JOB, { documentId }, { ...SCAN_JOB_OPTIONS, jobId: documentId });
    return true;
  }
  // Échoué (abandonné après des blocages) ou terminé sans verdict écrit : rejoué. En attente,
  // différé ou actif : rien.
  const state = await job.getState();
  if (state !== 'failed' && state !== 'completed') return false;
  // Compteurs remis à zéro : sinon le premier essai rejoué serait le dernier, et une panne passagère
  // écrirait aussitôt le verdict `error`.
  await job.retry(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
  return true;
}
