import { QR_QUIET_ZONE, qrModules } from '@oz/core';
import PDFDocument from 'pdfkit';

// Documents PDF de la fiche joueur (lot 1.13b, EX-115 n° 5, EX-119) : polices standard PDF seules
// (Helvetica, encodage WinAnsi), aucune image, police ni ressource externe, aucun lien. Le QR est
// dessiné en carrés vectoriels depuis la matrice de `@oz/core`. Rendu synchrone (D4 du lot).

const SEGMENTER = new Intl.Segmenter('fr', { granularity: 'grapheme' });
/** Caractères affichés (graphèmes), jamais coupés au milieu d'une paire de substitution. */
export const graphemes = (text: string): string[] =>
  Array.from(SEGMENTER.segment(text), (part) => part.segment);

/** Caractères WinAnsi hors Latin-1 (plage 0x80 à 0x9F). */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
/** Texte réduit aux caractères des polices standard (WinAnsi) : le reste devient `?`. */
export function winAnsi(text: string): string {
  return graphemes(text.normalize('NFC'))
    .map((char) => {
      if (char.length !== 1) return '?';
      const code = char.charCodeAt(0);
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return char;
      return WIN_ANSI_EXTRA.includes(char) ? char : '?';
    })
    .join('');
}

/** Rassemble le flux du document en un seul tampon. */
function bufferOf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
    doc.end();
  });
}

/** QR en carrés noirs sur fond blanc, zone calme comprise, dans un carré de `size` points. */
export function drawQr(doc: PDFKit.PDFDocument, data: string, x: number, y: number, size: number) {
  const modules = qrModules(data);
  const unit = size / (modules.length + 2 * QR_QUIET_ZONE);
  doc.save().rect(x, y, size, size).fill('#ffffff');
  modules.forEach((line, row) => {
    line.forEach((dark, col) => {
      if (dark) {
        doc.rect(x + (col + QR_QUIET_ZONE) * unit, y + (row + QR_QUIET_ZONE) * unit, unit, unit);
      }
    });
  });
  doc.fill('#000000').restore();
}

export interface DocumentMeta {
  readonly title: string;
  /** Instant d'édition, porté aussi par les métadonnées du PDF. */
  readonly issuedAt: Date;
}

/** Nouveau document A4 (ou au format donné) sans métadonnée personnelle. */
export function newDocument(
  meta: DocumentMeta,
  size: PDFKit.PDFDocumentOptions['size'] = 'A4',
  margin = 48,
): PDFKit.PDFDocument {
  return new PDFDocument({
    size,
    margin,
    autoFirstPage: true,
    info: {
      Title: winAnsi(meta.title),
      Producer: 'OZ',
      Creator: 'OZ',
      CreationDate: meta.issuedAt,
      ModDate: meta.issuedAt,
    },
  });
}

export const finish = bufferOf;
