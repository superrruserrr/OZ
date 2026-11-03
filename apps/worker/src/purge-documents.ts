import type { DuePurge } from '@oz/db';
import { cleanKey, quarantineKey, type DocumentStorage } from '@oz/storage';
import type { ScanLogger } from './scan-document.js';

// Purge des pièces échues (lot 1.9cb, EX-110 n° 7, CP-20, ADR-008) : fichiers supprimés d'abord,
// puis la pièce marquée purgée par la fonction privilégiée, qui relit les conditions sous verrou.
// Une suppression en échec laisse la pièce non marquée : elle est reprise à l'exécution suivante.
// La base ne rend jamais une pièce dont une URL de lecture a été délivrée depuis 5 minutes (D-101).

export interface PurgeDependencies {
  listDue(limit: number): Promise<DuePurge[]>;
  finish(documentId: string): Promise<'done' | 'skipped'>;
  storage: Pick<DocumentStorage, 'remove'>;
  logger: ScanLogger;
}

export interface PurgeSummary {
  readonly purged: number;
  readonly skipped: number;
  readonly failed: number;
}

/** Purge un lot de pièces échues ; une erreur sur l'une n'interrompt pas les autres. */
export async function purgeDueDocuments(
  deps: PurgeDependencies,
  limit: number,
): Promise<PurgeSummary> {
  const due = await deps.listDue(limit);
  let purged = 0;
  let skipped = 0;
  let failed = 0;
  for (const doc of due) {
    try {
      // Suppressions idempotentes : selon le verdict, le fichier est sous `clean/` ou nulle part.
      await deps.storage.remove(cleanKey(doc.id));
      await deps.storage.remove(quarantineKey(doc.id));
      if ((await deps.finish(doc.id)) === 'done') {
        purged += 1;
        deps.logger.info({ documentId: doc.id, documentType: doc.type }, 'document.purge.purged');
      } else {
        skipped += 1;
        deps.logger.info({ documentId: doc.id }, 'document.purge.skipped');
      }
    } catch (error) {
      failed += 1;
      deps.logger.warn(
        { documentId: doc.id, cause: error instanceof Error ? error.name : 'inconnue' },
        'document.purge.failed',
      );
    }
  }
  deps.logger.info({ purged, skipped, failed }, 'document.purge.done');
  return { purged, skipped, failed };
}
