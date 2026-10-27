import { CROCKFORD_ALPHABET, crockfordSymbol, normalizeCrockford } from './crockford.js';
import { DAMM_TABLE } from './damm-table.js';

/** OZ ID canonique, contrôle vérifié : `OZ-CM-26-7K4M9Q-M` (EX-102, ADR-007). */
export type OzId = string & { readonly __brand: 'OzId' };

/** Parties choisies à l'émission ; le contrôle en est déduit. */
export interface OzIdParts {
  /** Pays de rattachement, ISO 3166-1 alpha-2 en majuscules (D1 du lot 1.2). */
  readonly country: string;
  /** Année d'émission sur deux chiffres, 0 à 99. */
  readonly year: number;
  /** Six symboles Crockford canoniques. */
  readonly random: string;
}

export type OzIdErrorCode =
  | 'OZ_ID_INVALID_COUNTRY'
  | 'OZ_ID_INVALID_YEAR'
  | 'OZ_ID_INVALID_RANDOM'
  | 'OZ_ID_INVALID_FORMAT'
  | 'OZ_ID_INVALID_CHECKSUM';

export class OzIdError extends Error {
  constructor(
    readonly code: OzIdErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OzIdError';
  }
}

/** Même expression que la contrainte `players_oz_id_check` de la base. */
export const OZ_ID_PATTERN = /^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$/;

const COUNTRY = /^[A-Z]{2}$/;
const RANDOM = /^[0-9A-HJKMNP-TV-Z]{6}$/;
/** Espaces, tirets (dont typographiques) et caractères invisibles ignorés à la saisie. */
const SEPARATORS = /[\s\p{Pd}\u2212\u200B-\u200D\u2060\uFEFF]/gu;
/** Longueur maximale d'une saisie examinée : au-delà, ce n'est pas un OZ ID. */
const MAX_INPUT_LENGTH = 64;

/** Valeur d'un symbole Crockford déjà vérifié par une expression. */
const valueOf = (symbol: string): number => CROCKFORD_ALPHABET.indexOf(symbol);
/** Table aplatie en chaîne : accès indexé sans valeur indéfinie possible. */
const FLAT_TABLE = String.fromCharCode(...DAMM_TABLE.flat());

/**
 * Valeurs d'entrée du calcul, sur l'identifiant entier sans tirets ni préfixe constant `OZ`
 * (TD-017) : lettres du pays → 0 à 25, chiffres de l'année → 0 à 9, partie aléatoire → 0 à 31.
 */
function bodyValues(country: string, year: string, random: string): number[] {
  return [
    ...Array.from(country, (letter) => letter.charCodeAt(0) - 65),
    ...Array.from(year, Number),
    ...Array.from(random, valueOf),
  ];
}

/** Intérim de Damm : 0 pour une suite contrôle compris valide, le symbole de contrôle sinon. */
function damm(values: readonly number[]): number {
  let interim = 0;
  for (const value of values) interim = FLAT_TABLE.charCodeAt(interim * 32 + value);
  return interim;
}

function checkedParts(parts: unknown): [string, string, string] {
  // Frontière non typée (JavaScript, corps de requête) : la forme est vérifiée avant toute lecture.
  const { country, year, random } = (
    typeof parts === 'object' && parts !== null ? parts : {}
  ) as Partial<OzIdParts>;
  if (typeof country !== 'string' || !COUNTRY.test(country)) {
    throw new OzIdError(
      'OZ_ID_INVALID_COUNTRY',
      'pays attendu : deux lettres majuscules ISO 3166-1',
    );
  }
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 0 || year > 99) {
    throw new OzIdError('OZ_ID_INVALID_YEAR', 'année attendue : entier de 0 à 99');
  }
  if (typeof random !== 'string' || !RANDOM.test(random)) {
    throw new OzIdError(
      'OZ_ID_INVALID_RANDOM',
      'partie aléatoire attendue : six symboles Crockford',
    );
  }
  return [country, String(year).padStart(2, '0'), random];
}

/** Symbole de contrôle de Damm des parties (TD-017). */
export function computeOzIdCheck(parts: OzIdParts): string {
  const [country, year, random] = checkedParts(parts);
  return crockfordSymbol(damm(bodyValues(country, year, random)));
}

/** OZ ID canonique des parties, contrôle compris. */
export function formatOzId(parts: OzIdParts): OzId {
  const check = computeOzIdCheck(parts);
  return `OZ-${parts.country}-${String(parts.year).padStart(2, '0')}-${parts.random}-${check}` as OzId;
}

/** Vrai pour un OZ ID en forme canonique exacte dont le contrôle est juste ; vérifiable hors ligne. */
export function isValidOzId(value: unknown): value is OzId {
  if (typeof value !== 'string' || !OZ_ID_PATTERN.test(value)) return false;
  const values = bodyValues(value.slice(3, 5), value.slice(6, 8), value.slice(9, 15));
  return damm([...values, valueOf(value.slice(16))]) === 0;
}

export type ParseOzIdResult =
  | { readonly ok: true; readonly ozId: OzId }
  | { readonly ok: false; readonly code: 'OZ_ID_INVALID_FORMAT' | 'OZ_ID_INVALID_CHECKSUM' };

/**
 * Lit un OZ ID tapé ou dicté : casse, espaces et tirets indifférents ; O lu comme 0 et I ou L comme 1
 * dans l'année et la partie aléatoire, 0 lu comme O dans le préfixe et le pays. Pleine chasse et
 * tirets typographiques (copier-coller) sont ramenés à l'ASCII. Ne lève jamais, même hors chaîne.
 */
export function parseOzId(input: unknown): ParseOzIdResult {
  const invalid = { ok: false, code: 'OZ_ID_INVALID_FORMAT' } as const;
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return invalid;
  const compact = input
    .normalize('NFKC')
    .replace(SEPARATORS, '')
    .replace(/[^\x21-\x7E]/g, '?')
    .toUpperCase();
  if (compact.length !== 13) return invalid;
  const prefix = compact.slice(0, 2).replace(/0/g, 'O');
  const country = compact.slice(2, 4).replace(/0/g, 'O');
  const year = normalizeCrockford(compact.slice(4, 6));
  const tail = normalizeCrockford(compact.slice(6));
  if (prefix !== 'OZ' || !COUNTRY.test(country) || !/^[0-9]{2}$/.test(year)) return invalid;
  const candidate = `OZ-${country}-${year}-${tail.slice(0, 6)}-${tail.slice(6)}`;
  if (!OZ_ID_PATTERN.test(candidate)) return invalid;
  if (!isValidOzId(candidate)) return { ok: false, code: 'OZ_ID_INVALID_CHECKSUM' };
  return { ok: true, ozId: candidate };
}
