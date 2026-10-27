import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CROCKFORD_ALPHABET,
  crockfordSymbol,
  crockfordValue,
  normalizeCrockford,
} from './crockford.js';
import { DAMM_TABLE } from './damm-table.js';

const ORDER = 32;
const range = [...Array(ORDER).keys()];
const at = (x: number, y: number): number => DAMM_TABLE[x]?.[y] ?? -1;

describe('alphabet Crockford', () => {
  it('compte 32 symboles distincts, sans I, L, O ni U (CP-04)', () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(ORDER);
    expect(new Set(CROCKFORD_ALPHABET).size).toBe(ORDER);
    expect(CROCKFORD_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it('convertit valeur et symbole dans les deux sens', () => {
    for (const value of range) expect(crockfordValue(crockfordSymbol(value))).toBe(value);
    expect(crockfordSymbol(31)).toBe('Z');
    expect(crockfordValue('U')).toBeUndefined();
    expect(crockfordValue('a')).toBeUndefined();
    expect(() => crockfordSymbol(32)).toThrow(RangeError);
    expect(() => crockfordSymbol(1.5)).toThrow(RangeError);
  });

  it('normalise une saisie dictée : minuscules, O → 0, I et L → 1, séparateurs ignorés', () => {
    expect(normalizeCrockford('7k4m9q')).toBe('7K4M9Q');
    expect(normalizeCrockford('o i l')).toBe('011');
    expect(normalizeCrockford('7K-4M 9Q')).toBe('7K4M9Q');
    expect(normalizeCrockford('U')).toBe('U');
  });
});

describe('table de Damm (TD-017)', () => {
  it('est une table 32 × 32 de valeurs 0 à 31', () => {
    expect(DAMM_TABLE).toHaveLength(ORDER);
    for (const row of DAMM_TABLE) {
      expect(row).toHaveLength(ORDER);
      for (const cell of row)
        expect(cell >= 0 && cell < ORDER && Number.isInteger(cell)).toBe(true);
    }
  });

  it('est un quasigroupe : chaque ligne et chaque colonne est une permutation', () => {
    for (const i of range) {
      expect(new Set(range.map((j) => at(i, j))).size).toBe(ORDER);
      expect(new Set(range.map((j) => at(j, i))).size).toBe(ORDER);
    }
  });

  it('a une diagonale nulle : le symbole de contrôle est l’intérim final', () => {
    for (const i of range) expect(at(i, i)).toBe(0);
  });

  it('est totalement anti-symétrique : (c∘x)∘y = (c∘y)∘x implique x = y (32³ cas)', () => {
    let violations = 0;
    for (const c of range)
      for (const x of range)
        for (const y of range) if (x !== y && at(at(c, x), y) === at(at(c, y), x)) violations += 1;
    expect(violations).toBe(0);
  });

  it('est figée à vie : son empreinte SHA-256 ne change jamais', () => {
    const bytes = Uint8Array.from(DAMM_TABLE.flat());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'a6e731a507e4a87b8d34c05056179ab8faa569a227c24b208b4f9346fa35c4b5',
    );
  });
});
