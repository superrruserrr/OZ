import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CROCKFORD_ALPHABET } from './crockford.js';
import {
  computeOzIdCheck,
  formatOzId,
  isValidOzId,
  OZ_ID_PATTERN,
  OzIdError,
  parseOzId,
  type OzIdParts,
} from './oz-id.js';

/** Calculés par un script indépendant de ce code (Damm GF(2⁵), α = 2) : ils figent le calcul. */
const REFERENCE_OZ_IDS = [
  'OZ-CM-26-7K4M9Q-M',
  'OZ-CI-26-000000-4',
  'OZ-SN-27-ZZZZZZ-9',
  'OZ-FR-99-ABCDEF-0',
  'OZ-NG-00-1H3J5K-6',
  'OZ-GH-26-QRSTVW-4',
] as const;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

const partsArbitrary: fc.Arbitrary<OzIdParts> = fc.record({
  country: fc.string({ unit: fc.constantFrom(...Array.from(LETTERS)), minLength: 2, maxLength: 2 }),
  year: fc.integer({ min: 0, max: 99 }),
  random: fc.string({
    unit: fc.constantFrom(...Array.from(CROCKFORD_ALPHABET)),
    minLength: 6,
    maxLength: 6,
  }),
});

/** Positions (dans la forme canonique) et alphabet admissible de chaque caractère significatif. */
const POSITIONS: readonly (readonly [number, string])[] = [
  [3, LETTERS],
  [4, LETTERS],
  [6, DIGITS],
  [7, DIGITS],
  ...[9, 10, 11, 12, 13, 14, 16].map((i) => [i, CROCKFORD_ALPHABET] as const),
];

const replaceAt = (value: string, index: number, char: string): string =>
  value.slice(0, index) + char + value.slice(index + 1);

describe('OZ ID : vecteurs de référence', () => {
  it.each(REFERENCE_OZ_IDS)('%s est valide et respecte le format (EX-102 n° 1)', (ozId) => {
    expect(isValidOzId(ozId)).toBe(true);
    expect(ozId).toMatch(OZ_ID_PATTERN);
  });

  it('recalcule le contrôle des vecteurs à partir de leurs parties', () => {
    expect(computeOzIdCheck({ country: 'CM', year: 26, random: '7K4M9Q' })).toBe('M');
    expect(formatOzId({ country: 'NG', year: 0, random: '1H3J5K' })).toBe('OZ-NG-00-1H3J5K-6');
  });

  it('applique la même expression que la contrainte players_oz_id_check', () => {
    expect(OZ_ID_PATTERN.source).toBe(
      '^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$',
    );
  });
});

describe('OZ ID : entrées refusées', () => {
  it.each([
    [{ country: 'cm', year: 26, random: '7K4M9Q' }, 'OZ_ID_INVALID_COUNTRY'],
    [{ country: 'CMR', year: 26, random: '7K4M9Q' }, 'OZ_ID_INVALID_COUNTRY'],
    [{ country: 'C1', year: 26, random: '7K4M9Q' }, 'OZ_ID_INVALID_COUNTRY'],
    [{ country: 'CM', year: 100, random: '7K4M9Q' }, 'OZ_ID_INVALID_YEAR'],
    [{ country: 'CM', year: -1, random: '7K4M9Q' }, 'OZ_ID_INVALID_YEAR'],
    [{ country: 'CM', year: 2.5, random: '7K4M9Q' }, 'OZ_ID_INVALID_YEAR'],
    [{ country: 'CM', year: 26, random: '7K4M9' }, 'OZ_ID_INVALID_RANDOM'],
    [{ country: 'CM', year: 26, random: '7K4M9U' }, 'OZ_ID_INVALID_RANDOM'],
    [{ country: 'CM', year: 26, random: '7k4m9q' }, 'OZ_ID_INVALID_RANDOM'],
  ] as const)('%o → %s', (parts, code) => {
    expect(() => formatOzId(parts)).toThrow(OzIdError);
    try {
      computeOzIdCheck(parts);
    } catch (error) {
      expect(error).toBeInstanceOf(OzIdError);
      expect((error as OzIdError).code).toBe(code);
    }
    expect.assertions(3);
  });

  it.each([
    '',
    'OZ-CM-26-7K4M9Q',
    'OZ-CM-26-7K4M9Q-N',
    'oz-cm-26-7k4m9q-m',
    'OZ-CM-26-7K4M9Q-M ',
    'XZ-CM-26-7K4M9Q-M',
    'OZ-CM-26-7K4M9U-M',
    'OZCM267K4M9QM',
  ])('isValidOzId refuse la forme non canonique ou fausse « %s »', (value) => {
    expect(isValidOzId(value)).toBe(false);
  });

  it.each([null, undefined, 'CM', { country: 'CM', year: '26', random: '7K4M9Q' }])(
    'formatOzId lève une OzIdError typée hors objet attendu (%o)',
    (parts) => {
      expect(() => formatOzId(parts as unknown as OzIdParts)).toThrow(OzIdError);
    },
  );

  it('isValidOzId refuse ce qui n’est pas une chaîne', () => {
    expect(isValidOzId(undefined)).toBe(false);
    expect(isValidOzId(42)).toBe(false);
  });
});

describe('OZ ID : propriétés', () => {
  it('CP-01 / CP-04 : tout OZ ID formé est valide, et sa partie aléatoire est sans I, L, O, U', () => {
    fc.assert(
      fc.property(partsArbitrary, (parts) => {
        const ozId = formatOzId(parts);
        expect(isValidOzId(ozId)).toBe(true);
        expect(ozId.slice(9)).not.toMatch(/[ILOU]/);
      }),
      { numRuns: 2_000 },
    );
  });

  it('CP-01 : toute substitution d’un seul caractère, contrôle compris, rend l’OZ ID invalide', () => {
    fc.assert(
      fc.property(partsArbitrary, (parts) => {
        const ozId = formatOzId(parts);
        for (const [index, alphabet] of POSITIONS) {
          for (const char of alphabet) {
            if (char === ozId[index]) continue;
            expect(isValidOzId(replaceAt(ozId, index, char))).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('détecte toute inversion de deux caractères voisins différents, dont (dernier, contrôle)', () => {
    // Paires voisines dans l'identifiant sans tirets : seules les permutations qui restent bien
    // formées sont à détecter par le contrôle ; les autres sont refusées par le format.
    const compactIndexes = [3, 4, 6, 7, 9, 10, 11, 12, 13, 14, 16];
    let checked = 0;
    fc.assert(
      fc.property(partsArbitrary, (parts) => {
        const ozId = formatOzId(parts);
        for (let k = 0; k + 1 < compactIndexes.length; k += 1) {
          const i = compactIndexes[k] ?? 0;
          const j = compactIndexes[k + 1] ?? 0;
          const a = ozId[i] ?? '';
          const b = ozId[j] ?? '';
          if (a === b) continue;
          const swapped = replaceAt(replaceAt(ozId, i, b), j, a);
          if (!OZ_ID_PATTERN.test(swapped)) continue;
          checked += 1;
          expect(isValidOzId(swapped)).toBe(false);
        }
      }),
      { numRuns: 3_000 },
    );
    expect(checked).toBeGreaterThan(20_000);
  });

  it('détecte l’inversion (dernier caractère, contrôle) pour toutes les paires de valeurs', () => {
    for (const last of CROCKFORD_ALPHABET) {
      const ozId = formatOzId({ country: 'CM', year: 26, random: `7K4M9${last}` });
      const check = ozId.slice(-1);
      if (check === last) continue;
      expect(isValidOzId(`${ozId.slice(0, -3)}${check}-${last}`)).toBe(false);
    }
  });

  it('parseOzId rend la forme canonique de toute variante dictée d’un OZ ID valide', () => {
    fc.assert(
      fc.property(partsArbitrary, fc.boolean(), fc.boolean(), (parts, lower, compact) => {
        const ozId = formatOzId(parts);
        let typed = lower ? ozId.toLowerCase() : ozId;
        typed = compact ? typed.replace(/-/g, '') : typed.replace(/-/g, ' - ');
        expect(parseOzId(typed)).toEqual({ ok: true, ozId });
      }),
      { numRuns: 1_000 },
    );
  });
});

describe('parseOzId', () => {
  it('ramène pleine chasse, tirets typographiques et caractères invisibles à la forme canonique', () => {
    const expected = { ok: true, ozId: 'OZ-CM-26-7K4M9Q-M' };
    expect(parseOzId('OZ\u2013CM\u2011 26\u2014 7K4M9Q\u2212M')).toEqual(expected);
    expect(parseOzId('ＯＺ－ＣＭ－２６－７Ｋ４Ｍ９Ｑ－Ｍ')).toEqual(expected);
    expect(parseOzId('OZ-CM-26-7K4\u200BM9Q-M\uFEFF')).toEqual(expected);
  });

  it('refuse un caractère hors ASCII sans le transformer en lettre (ß, ı)', () => {
    expect(parseOzId('OZ-CM-26-7K4M9ß-M')).toEqual({ ok: false, code: 'OZ_ID_INVALID_FORMAT' });
    expect(parseOzId('OZ-CM-26-7K4M9ı-M')).toEqual({ ok: false, code: 'OZ_ID_INVALID_FORMAT' });
  });

  it.each([null, undefined, 42, {}, ['OZ-CM-26-7K4M9Q-M']])(
    'refuse une saisie qui n’est pas une chaîne (%o), sans lever',
    (input) => {
      expect(parseOzId(input)).toEqual({ ok: false, code: 'OZ_ID_INVALID_FORMAT' });
    },
  );

  it('lit O comme 0 et I ou L comme 1 dans l’année et la partie aléatoire', () => {
    expect(parseOzId('oz-ci-26-oooooo-4')).toEqual({ ok: true, ozId: 'OZ-CI-26-000000-4' });
    expect(parseOzId('OZ NG OO IH3J5K 6')).toEqual({ ok: true, ozId: 'OZ-NG-00-1H3J5K-6' });
    expect(parseOzId('0Z-NG-00-LH3J5K-6')).toEqual({ ok: true, ozId: 'OZ-NG-00-1H3J5K-6' });
  });

  it('lit 0 comme O dans le pays (codes CO, BO, OM…)', () => {
    const ozId = formatOzId({ country: 'CO', year: 26, random: '7K4M9Q' });
    expect(parseOzId(ozId.replace('-CO-', '-C0-'))).toEqual({ ok: true, ozId });
  });

  it.each([
    ['', 'OZ_ID_INVALID_FORMAT'],
    ['OZ-CM-26-7K4M9Q', 'OZ_ID_INVALID_FORMAT'],
    ['OZ-CM-26-7K4M9Q-M-X', 'OZ_ID_INVALID_FORMAT'],
    ['XY-CM-26-7K4M9Q-M', 'OZ_ID_INVALID_FORMAT'],
    ['OZ-C1-26-7K4M9Q-M', 'OZ_ID_INVALID_FORMAT'],
    ['OZ-CM-2A-7K4M9Q-M', 'OZ_ID_INVALID_FORMAT'],
    ['OZ-CM-26-7K4M9U-M', 'OZ_ID_INVALID_FORMAT'],
    ['OZ-CM-26-7K4M9Q-N', 'OZ_ID_INVALID_CHECKSUM'],
    ['OZ-CM-26-7K4M9Q-3', 'OZ_ID_INVALID_CHECKSUM'],
    ['OZ-CM-26-7K4M9Q-M'.repeat(10), 'OZ_ID_INVALID_FORMAT'],
  ])('« %s » → %s, sans exception', (input, code) => {
    expect(parseOzId(input)).toEqual({ ok: false, code });
  });
});
