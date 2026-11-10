// Âge et minorité (lot 1.7a, EX-107 n° 3 et 4, EX-T16) : calcul partagé par le navigateur, l'API
// et les contrats ; la base tient la même règle (`oz_is_minor_at`).

/** Majorité : en deçà, le bloc tuteur est obligatoire et bloquant. */
export const MAJORITY_AGE = 18;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Âge révolu, à la date UTC de `today`, d'une date de naissance `AAAA-MM-JJ`. Un 29 février compte
 * comme un 1er mars les années non bissextiles, comme en base.
 */
export function ageAt(birthDate: string, today: Date = new Date()): number {
  const match = ISO_DATE.exec(birthDate);
  if (!match) throw new RangeError('Date de naissance AAAA-MM-JJ attendue.');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const anniversary = Date.UTC(today.getUTCFullYear(), month - 1, day);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return today.getUTCFullYear() - year - (now < anniversary ? 1 : 0);
}

/** Mineur à la date UTC de `today`. */
export function isMinor(birthDate: string, today: Date = new Date()): boolean {
  return ageAt(birthDate, today) < MAJORITY_AGE;
}
