import { playerProfileOutputSchema } from '@oz/contracts';
import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvCell, rowReference, searchExportCsv, watermarkLine } from './csv.js';

// Export CSV (lot 1.14b, D4) : échappement RFC 4180, formules neutralisées, filigrane, références.

const KEY = 'k'.repeat(48);
/** Identifiant d'un autre export. */
const OTHER_EXPORT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const mark = {
  exportId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  reader: 'c***@example.test',
  roles: 'club',
  issuedAt: new Date('2026-11-10T10:00:00.000Z'),
  rows: 2,
  truncated: false,
};

describe('csvCell', () => {
  it('vide pour null et absent ; nombres tels quels', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(175)).toBe('175');
  });

  it('guillemets doublés, virgule et retour à la ligne entre guillemets', () => {
    expect(csvCell('Ndongo, "Éloïse"')).toBe('"Ndongo, ""Éloïse"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('formules neutralisées : =, +, -, @, |, pleine chasse, espaces, tabulation, retour chariot', () => {
    for (const formula of [
      '=HYPERLINK("x")',
      '+1',
      '-1+1',
      '@SUM(A1)',
      '\tx',
      '\rx',
      '  =1+1',
      '|cmd',
      '\uFF1D1+1',
      '\u3000@x',
    ]) {
      const cell = csvCell(formula);
      expect(cell.replace(/^"/, '').startsWith("'"), formula).toBe(true);
    }
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
    expect(csvCell('Douala - Akwa')).toBe('Douala - Akwa');
  });
});

describe('searchExportCsv', () => {
  it('colonnes : toutes celles de la fiche sauf le téléphone', () => {
    const fields = Object.keys(playerProfileOutputSchema.shape).filter((key) => key !== 'phone');
    expect([...CSV_COLUMNS].sort()).toEqual(fields.sort());
  });

  it('BOM, filigrane, en-têtes, une ligne par joueur, CRLF ; champ absent de la vue vide', () => {
    const csv = searchExportCsv(KEY, mark, [
      { ozId: 'OZ-CM-26-7K4M9Q-M', firstName: 'Éloïse', lastName: 'Ndongo', birthYear: 2001 },
      { ozId: 'OZ-CM-26-8K4M9Q-N', firstName: '=cmd', lastName: 'Ngassa', region: null },
    ]);
    expect(csv.startsWith('\uFEFF# OZ Football ID — export 0190a1b2')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('');
    expect(lines[1]).toBe(['ref', ...CSV_COLUMNS].join(','));
    const first = lines[2]?.split(',') ?? [];
    expect(first[0]).toBe(rowReference(KEY, mark.exportId, 'OZ-CM-26-7K4M9Q-M'));
    expect(first.slice(1, 5)).toEqual(['OZ-CM-26-7K4M9Q-M', '', 'Éloïse', 'Ndongo']);
    expect(first[CSV_COLUMNS.indexOf('birthYear') + 1]).toBe('2001');
    expect(first[CSV_COLUMNS.indexOf('heightCm') + 1]).toBe('');
    expect(lines[3]?.split(',')[3]).toBe("'=cmd");
  });

  it('filigrane : demandeur masqué, rôles, instant UTC, lignes et limite', () => {
    expect(watermarkLine({ ...mark, truncated: true })).toBe(
      '# OZ Football ID — export 0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b — c***@example.test (club) — 2026-11-10T10:00:00.000Z — 2 lignes (limite du palier atteinte)',
    );
  });

  it('référence : 12 caractères hexadécimaux, propre à la clé, à l’export et au joueur', () => {
    const ref = rowReference(KEY, mark.exportId, 'OZ-CM-26-7K4M9Q-M');
    expect(ref).toMatch(/^[0-9a-f]{12}$/);
    expect(rowReference(KEY, mark.exportId, 'OZ-CM-26-8K4M9Q-N')).not.toBe(ref);
    expect(rowReference(KEY, OTHER_EXPORT, 'OZ-CM-26-7K4M9Q-M')).not.toBe(ref);
    expect(rowReference('z'.repeat(48), mark.exportId, 'OZ-CM-26-7K4M9Q-M')).not.toBe(ref);
  });
});
