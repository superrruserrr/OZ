import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LEGAL_DOCS, type LegalDoc } from '../site/routes';

/*
 * Textes légaux lus dans `docs/legal/` (source unique, lot 1.6, D2). Le dossier est copié dans
 * l'image autonome par `outputFileTracingIncludes` (next.config.ts) ; le serveur s'exécute depuis
 * `apps/web` en développement comme dans l'image.
 */
export async function loadLegalDoc(doc: LegalDoc): Promise<string> {
  return readFile(path.join(process.cwd(), '..', '..', 'docs', 'legal', LEGAL_DOCS[doc]), 'utf8');
}
