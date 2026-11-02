import { documentScanJobSchema } from '@oz/contracts';
import { UnrecoverableError } from 'bullmq';
import { scanDocument, type ScanDependencies, type ScanOutcome } from './scan-document.js';

// Consommateur de la file `document-scan` (lot 1.9b) : le message ne porte que l'identifiant du
// document, tout le reste est relu en base. Un message hors contrat est abandonné sans nouvel essai.

/** Nom de la file et du job, identiques au producteur de l'API (`apps/api/src/document/scan-queue.ts`). */
export const DOCUMENT_SCAN_QUEUE = 'document-scan';
export const DOCUMENT_SCAN_JOB = 'scan-document';

/** Ce que le processeur lit d'un job BullMQ. */
export interface ScanJob {
  readonly name: string;
  readonly data: unknown;
  /** Essais déjà terminés en échec (0 au premier). */
  readonly attemptsMade: number;
  readonly opts: { readonly attempts?: number | undefined };
}

export function createScanProcessor(
  deps: ScanDependencies,
): (job: ScanJob) => Promise<ScanOutcome> {
  return async (job) => {
    const message = documentScanJobSchema.safeParse(job.data);
    if (job.name !== DOCUMENT_SCAN_JOB || !message.success) {
      // Contenu du message non journalisé : il ne vient pas d'une source de confiance.
      deps.logger.error({}, 'document.scan.invalid_job');
      throw new UnrecoverableError('message hors contrat');
    }
    const { documentId } = message.data;
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const outcome = await scanDocument(deps, documentId, { lastAttempt });
    deps.logger.info({ documentId, outcome }, 'document.scan.done');
    return outcome;
  };
}
