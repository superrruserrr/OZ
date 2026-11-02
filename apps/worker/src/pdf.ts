import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Contrôle des PDF (lot 1.9b, D5, EX-110 n° 2) : nombre de pages de 1 à 20, chaque page réellement
// présente. Aucun rendu, aucune police, aucun JavaScript évalué (pdf.js 6 n'a plus de chemin
// `eval`), aucun accès réseau : pdf.js ne sert qu'à lire la structure. Chiffré, tronqué ou
// corrompu : illisible ; chiffré, même lisible sans mot de passe : illisible.

export type PdfOutcome =
  | { readonly ok: true; readonly pageCount: number }
  | { readonly ok: false; readonly reason: 'pages' | 'unreadable' };

const MAX_PAGES = 20;

export async function inspectPdf(bytes: Uint8Array): Promise<PdfOutcome> {
  // Copie : pdf.js transfère le tampon qu'on lui donne au lecteur, qui le détache.
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    // Chiffré mais ouvert sans mot de passe (utilisateur vide) : pdf.js le déchiffre sans rien
    // signaler ; refusé comme tout PDF chiffré (contenu non contrôlable par les outils de revue).
    const { info } = await pdf.getMetadata();
    if ((info as { EncryptFilterName?: unknown }).EncryptFilterName != null) {
      return { ok: false, reason: 'unreadable' };
    }
    const count = pdf.numPages;
    if (count < 1 || count > MAX_PAGES) return { ok: false, reason: 'pages' };
    // Le nombre annoncé par l'arbre des pages peut mentir : chaque page doit exister.
    for (let page = 1; page <= count; page += 1) await pdf.getPage(page);
    return { ok: true, pageCount: count };
  } catch {
    return { ok: false, reason: 'unreadable' };
  } finally {
    await task.destroy();
  }
}
