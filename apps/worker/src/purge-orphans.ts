import type { DocumentStorage, StoragePrefix } from '@oz/storage';
import type { ScanLogger } from './scan-document.js';

// Objets orphelins (lot 1.9cb, D-062, D-092) : envoi jamais réceptionné, quarantaine restée après
// un verdict, fichier sain sans verdict `clean` ou d'une pièce purgée. Seuls les objets d'au moins
// une heure sont examinés (copie de réception et analyse en cours exclues) ; seule la base désigne
// ce qui est supprimé. Un curseur par préfixe fait avancer l'examen d'une exécution à l'autre.

const PREFIXES: readonly StoragePrefix[] = ['incoming/', 'quarantine/', 'clean/'];
/** Clés soumises à la base par appel (borne de `oz_document_storage_orphans`). */
const CHUNK = 500;
export const ORPHAN_MIN_AGE_MS = 3_600_000;
export const ORPHANS_PER_PREFIX = 1_000;

export interface OrphanDependencies {
  findOrphans(keys: readonly string[]): Promise<string[]>;
  storage: Pick<DocumentStorage, 'list' | 'remove'>;
  logger: ScanLogger;
  now?: () => Date;
}

export interface OrphanSummary {
  readonly examined: number;
  readonly removed: number;
  readonly failed: number;
}

/** Purgeur d'orphelins ; garde en mémoire, par préfixe, où reprendre l'examen. */
export function createOrphanPurger(
  deps: OrphanDependencies,
  perPrefix = ORPHANS_PER_PREFIX,
): () => Promise<Record<StoragePrefix, OrphanSummary>> {
  const cursors = new Map<StoragePrefix, string>();
  const now = deps.now ?? (() => new Date());
  return async () => {
    const summary = {} as Record<StoragePrefix, OrphanSummary>;
    for (const prefix of PREFIXES) {
      const page = await deps.storage.list(prefix, {
        olderThan: new Date(now().getTime() - ORPHAN_MIN_AGE_MS),
        limit: perPrefix,
        startAfter: cursors.get(prefix),
      });
      if (page.next === undefined) cursors.delete(prefix);
      else cursors.set(prefix, page.next);
      let removed = 0;
      let failed = 0;
      const keys = page.objects.map((object) => object.key);
      for (let start = 0; start < keys.length; start += CHUNK) {
        for (const key of await deps.findOrphans(keys.slice(start, start + CHUNK))) {
          try {
            await deps.storage.remove(key);
            removed += 1;
          } catch (error) {
            failed += 1;
            deps.logger.warn(
              { prefix, cause: error instanceof Error ? error.name : 'inconnue' },
              'document.orphan.remove_failed',
            );
          }
        }
      }
      // Comptes seuls : aucune clé au journal.
      deps.logger.info(
        { prefix, examined: keys.length, removed, failed },
        'document.orphan.removed',
      );
      summary[prefix] = { examined: keys.length, removed, failed };
    }
    return summary;
  };
}
