import { inflateSync } from 'node:zlib';

// Lecture de test d'un PDF produit par pdfkit : flux de contenu décompressés, puis chaînes des
// opérateurs `Tj` / `TJ` (hexadécimal WinAnsi, polices standard). Pas un lecteur PDF général.

/** Flux de contenu décompressés (Flate). */
export function pdfStreams(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1');
  const streams: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const bytes = Buffer.from(match[1] ?? '', 'latin1');
    try {
      streams.push(inflateSync(bytes).toString('latin1'));
    } catch {
      streams.push(bytes.toString('latin1'));
    }
  }
  return streams;
}

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};
const decodeHex = (hex: string): string =>
  [...Buffer.from(hex, 'hex')].map((b) => WIN_ANSI_HIGH[b] ?? String.fromCharCode(b)).join('');

/** Textes affichés, un par opérateur de texte, dans l'ordre des flux. */
export function pdfTexts(pdf: Buffer): string[] {
  const texts: string[] = [];
  for (const stream of pdfStreams(pdf)) {
    for (const match of stream.matchAll(/\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
      const parts =
        match[1] === undefined
          ? [match[2] ?? '']
          : [...match[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1] ?? '');
      texts.push(parts.map(decodeHex).join(''));
    }
  }
  return texts;
}
