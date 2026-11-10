import { createHmac } from 'node:crypto';
import type { PlayerProfileOutput } from '@oz/contracts';

// Export CSV de la recherche (lot 1.14b, D4) : colonnes de la fiche dans un ordre fixe, sans
// téléphone ; une ligne de filigrane au nom du demandeur et une référence par ligne, traçable par OZ
// seule (HMAC dérivé de `AUTH_HMAC_KEY`). Cellules neutralisées contre l'injection de formules.

/** Colonnes de la fiche, dans l'ordre du contrat ; le téléphone n'est jamais listé. */
export const CSV_COLUMNS = [
  'ozId',
  'id',
  'firstName',
  'lastName',
  'birthDate',
  'birthYear',
  'nationality',
  'country',
  'region',
  'city',
  'primaryPosition',
  'secondaryPosition',
  'dominantFoot',
  'heightCm',
  'weightKg',
  'verificationStatus',
  'verificationLevel',
  'organizationId',
] as const satisfies readonly (keyof PlayerProfileOutput)[];

/**
 * Début de cellule interprété comme une formule par un tableur : `=`, `+`, `-`, `@`, `|`, leurs
 * formes pleine chasse, tabulation et retour chariot, même après des espaces.
 */
const FORMULA = /^[\s\u3000]*[=+\-@|\uFF1D\uFF0B\uFF0D\uFF20\uFF5C]|^[\t\r]/;

/** Cellule CSV (RFC 4180) : formule neutralisée par une apostrophe, puis guillemets si besoin. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const derive = (hmacKey: string): Buffer =>
  createHmac('sha256', hmacKey).update('oz/player-search-export-ref/v1').digest();

/**
 * Référence d'une ligne : 12 caractères hexadécimaux, propres à l'export et au joueur (OZ ID) ; une
 * ligne fuitée se rattache à son export en recalculant les références des exports inscrits.
 */
export function rowReference(hmacKey: string, exportId: string, ozId: string): string {
  return createHmac('sha256', derive(hmacKey))
    .update(`${exportId}\n${ozId}`)
    .digest('hex')
    .slice(0, 12);
}

export interface ExportWatermark {
  readonly exportId: string;
  /** Email masqué du demandeur (`j***@example.test`). */
  readonly reader: string;
  readonly roles: string;
  readonly issuedAt: Date;
  readonly rows: number;
  /** Le palier a borné le nombre de lignes. */
  readonly truncated: boolean;
}

/** Ligne de filigrane, en tête du fichier. */
export function watermarkLine(mark: ExportWatermark): string {
  const lines = `${String(mark.rows)} lignes${mark.truncated ? ' (limite du palier atteinte)' : ''}`;
  return `# OZ Football ID — export ${mark.exportId} — ${mark.reader} (${mark.roles}) — ${mark.issuedAt.toISOString()} — ${lines}`;
}

/** Fichier complet : BOM UTF-8 (tableurs), filigrane, en-têtes, une ligne par joueur ; fins CRLF. */
export function searchExportCsv(
  hmacKey: string,
  mark: ExportWatermark,
  rows: readonly PlayerProfileOutput[],
): string {
  const lines = [
    csvCell(watermarkLine(mark)),
    ['ref', ...CSV_COLUMNS].join(','),
    ...rows.map((row, index) =>
      [
        // Toute vue porte l'OZ ID ; à défaut, le rang.
        rowReference(hmacKey, mark.exportId, row.ozId ?? `#${String(index)}`),
        ...CSV_COLUMNS.map((column) => csvCell(row[column])),
      ].join(','),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
