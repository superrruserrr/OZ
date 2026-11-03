import { describe, expect, it } from 'vitest';
import { ANONYMIZATION_REGISTRY } from '../anonymize/registry.js';
import {
  COMPUTED_FIELDS,
  EXPORT_REGISTRY,
  EXPORT_SECTIONS,
  exportedFields,
  type ExportField,
} from './registry.js';

const columns = Object.entries(EXPORT_REGISTRY).flatMap(([table, cols]) =>
  Object.entries(cols).map(([column, rule]) => ({ name: `${table}.${column}`, rule })),
);
const fields = columns.flatMap(({ rule }) => (typeof rule === 'string' ? [rule] : []));

describe('registre d’export', () => {
  it('mêmes tables et colonnes que le registre d’anonymisation', () => {
    const anonymized = Object.entries(ANONYMIZATION_REGISTRY).flatMap(([table, cols]) =>
      Object.keys(cols).map((column) => `${table}.${column}`),
    );
    expect(columns.map((c) => c.name).sort()).toEqual(anonymized.sort());
  });

  it('chaque champ est `section.champ` d’une section connue, rendu par une seule colonne', () => {
    for (const field of [...fields, ...COMPUTED_FIELDS]) {
      const [section, name, extra] = field.split('.');
      expect(EXPORT_SECTIONS, field).toContain(section);
      expect(name, field).toMatch(/^[a-z][A-Za-z]*$/);
      expect(extra, field).toBeUndefined();
    }
    const all: ExportField[] = [...fields, ...COMPUTED_FIELDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('chaque exclusion est motivée', () => {
    for (const { name, rule } of columns) {
      if (typeof rule !== 'string') expect(rule.excluded.trim().length, name).toBeGreaterThan(5);
    }
  });

  it('aucun secret, empreinte, index aveugle ni clé de stockage exporté (D6)', () => {
    const forbidden =
      /(password|secret|_hash$|_hmac$|sha256|storage_key|report_key|fingerprint|totp_last_step|ocr_)/;
    for (const { name, rule } of columns) {
      if (forbidden.test(name)) expect(typeof rule, name).not.toBe('string');
    }
  });

  it('champs attendus par section, triés', () => {
    const expected = exportedFields();
    expect(Object.keys(expected)).toEqual([...EXPORT_SECTIONS]);
    expect(expected.account).toContain('phone');
    expect(expected.players).toContain('relation');
    expect(expected.auditLog).toEqual([...expected.auditLog].sort());
    expect(expected.auditLog).not.toContain('actorUserId');
  });
});
