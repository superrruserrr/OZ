import { createHash } from 'node:crypto';
import type { ClaimedDocument, ScanVerdict } from '@oz/db';
import { cleanKey, type DocumentStorage } from '@oz/storage';
import type { ClamavClient } from './clamav.js';
import { processImage, type ImageMime } from './image.js';
import { inspectPdf } from './pdf.js';

// Analyse d'un document (lot 1.9b, EX-110 n° 2 à 5) : réclamation → lecture de la quarantaine →
// empreinte → antivirus → contrôles et ré-encodage → `clean/` écrit → verdict → quarantaine retirée.
// Le fichier propre est écrit avant le verdict et la quarantaine retirée après : un échec entre deux
// laisse un document `pending` dont le fichier est intact, rejoué au prochain essai. `clean/<id>` n'est
// jamais retiré ici : un verdict dont la réponse s'est perdue a pu être validé, et un autre essai du
// même document écrit la même clé ; un fichier sans verdict `clean` n'est servi par rien (purge, 1.9c).

/** Au-delà de la borne du dépôt, rien n'est lu. */
const MAX_BYTES = 52_428_800;
const IMAGE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export interface ScanLogger {
  info(fields: Record<string, unknown>, event: string): void;
  warn(fields: Record<string, unknown>, event: string): void;
  error(fields: Record<string, unknown>, event: string): void;
}

export interface ScanDependencies {
  claim(documentId: string): Promise<ClaimedDocument | null>;
  finish(documentId: string, verdict: ScanVerdict): Promise<'done' | 'skipped'>;
  storage: Pick<DocumentStorage, 'read' | 'put' | 'remove'>;
  clamav: Pick<ClamavClient, 'scan'>;
  logger: ScanLogger;
}

export type ScanOutcome = 'clean' | 'infected' | 'rejected' | 'skipped';

/**
 * Analyse un document `pending`. Lève une erreur sur toute panne (le job est rejoué) ; au dernier
 * essai, écrit d'abord le verdict `error` (document jamais accessible) et alerte.
 */
export async function scanDocument(
  deps: ScanDependencies,
  documentId: string,
  options: { readonly lastAttempt: boolean },
): Promise<ScanOutcome> {
  try {
    return await analyse(deps, documentId);
  } catch (error) {
    if (options.lastAttempt) {
      const cause = error instanceof Error ? error.name : 'inconnue';
      deps.logger.error({ documentId, cause }, 'document.scan.failed');
      await deps.finish(documentId, { verdict: 'error' }).catch(() => {
        deps.logger.error({ documentId }, 'document.scan.error_verdict_failed');
      });
    }
    throw error;
  }
}

async function analyse(deps: ScanDependencies, documentId: string): Promise<ScanOutcome> {
  const doc = await deps.claim(documentId);
  if (doc === null) {
    deps.logger.info({ documentId }, 'document.scan.skipped');
    return 'skipped';
  }
  const bytes = await deps.storage.read(doc.storageKey, MAX_BYTES);
  if (bytes === null) throw new Error('fichier absent de la quarantaine');

  // Le fichier lu doit être celui dont l'empreinte a été signée au dépôt.
  if (createHash('sha256').update(bytes).digest('hex') !== doc.sha256) {
    deps.logger.warn({ documentId }, 'document.scan.hash_mismatch');
    return judge(deps, doc, { verdict: 'rejected', reason: 'hash_mismatch' });
  }

  const scan = await deps.clamav.scan(bytes);
  if (scan.verdict === 'infected') {
    deps.logger.error(
      { documentId, documentType: doc.type, signature: scan.signature },
      'document.scan.infected',
    );
    return judge(deps, doc, scan);
  }

  let clean: { data: Uint8Array; verdict: ScanVerdict & { verdict: 'clean' } };
  if (IMAGE_MIMES.includes(doc.mimeType)) {
    const image = await processImage(bytes, doc.mimeType as ImageMime);
    if (!image.ok) return judge(deps, doc, { verdict: 'rejected', reason: image.reason });
    clean = {
      data: image.data,
      verdict: {
        verdict: 'clean',
        sizeBytes: image.data.byteLength,
        image: { width: image.width, height: image.height, perceptualHash: image.perceptualHash },
        pageCount: null,
      },
    };
  } else if (doc.mimeType === 'application/pdf') {
    const pdf = await inspectPdf(bytes);
    if (!pdf.ok) return judge(deps, doc, { verdict: 'rejected', reason: pdf.reason });
    clean = {
      data: bytes,
      verdict: {
        verdict: 'clean',
        sizeBytes: bytes.byteLength,
        image: null,
        pageCount: pdf.pageCount,
      },
    };
  } else {
    return judge(deps, doc, { verdict: 'rejected', reason: 'unreadable' });
  }

  await deps.storage.put(cleanKey(doc.id), clean.data, doc.mimeType);
  if ((await deps.finish(doc.id, clean.verdict)) === 'skipped') return 'skipped';
  await removeQuarantine(deps, doc);
  return 'clean';
}

/** Verdict `infected` ou `rejected` : aucun fichier ne subsiste une fois le verdict écrit. */
async function judge(
  deps: ScanDependencies,
  doc: ClaimedDocument,
  verdict: ScanVerdict & { verdict: 'infected' | 'rejected' },
): Promise<ScanOutcome> {
  if ((await deps.finish(doc.id, verdict)) === 'skipped') return 'skipped';
  await removeQuarantine(deps, doc);
  return verdict.verdict;
}

async function removeQuarantine(deps: ScanDependencies, doc: ClaimedDocument): Promise<void> {
  // Verdict déjà écrit : un échec ici laisse un orphelin journalisé (purge au lot 1.9c, D-092).
  await deps.storage.remove(doc.storageKey).catch(() => {
    deps.logger.warn({ documentId: doc.id }, 'document.scan.quarantine_cleanup_failed');
  });
}
