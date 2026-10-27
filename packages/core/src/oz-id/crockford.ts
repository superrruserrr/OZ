/** Alphabet base 32 de Crockford : sans I, L, O ni U, lisible et dictable sans ambiguïté (CP-04). */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const VALUES: ReadonlyMap<string, number> = new Map(
  Array.from(CROCKFORD_ALPHABET, (symbol, value) => [symbol, value]),
);

/** Valeur 0 à 31 d'un symbole canonique (majuscule), ou `undefined` s'il n'appartient pas à l'alphabet. */
export function crockfordValue(symbol: string): number | undefined {
  return VALUES.get(symbol);
}

/** Symbole canonique d'une valeur entière de 0 à 31. */
export function crockfordSymbol(value: number): string {
  const symbol = Number.isInteger(value) ? CROCKFORD_ALPHABET[value] : undefined;
  if (symbol === undefined)
    throw new RangeError(`valeur Crockford hors de 0..31 : ${String(value)}`);
  return symbol;
}

/**
 * Forme canonique d'une saisie dictée ou tapée : majuscules, O lu comme 0, I et L lus comme 1,
 * espaces et tirets ignorés. Un symbole hors alphabet (U, ponctuation) est laissé tel quel pour être
 * refusé ensuite.
 */
export function normalizeCrockford(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
