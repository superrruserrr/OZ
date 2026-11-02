// Minorité (EX-T16 n° 1) : calculée à chaque décision depuis la date de naissance, jamais conservée.

const MAJORITY_AGE = 18;

/**
 * Vrai avant le jour des 18 ans, calendrier UTC (`birth_date` est une date sans fuseau). Né un
 * 29 février : majeur le 1er mars. Une date invalide compte comme mineure : le doute protège.
 */
export function isMinor(birthDate: Date, now: Date): boolean {
  const majority = Date.UTC(
    birthDate.getUTCFullYear() + MAJORITY_AGE,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );
  return !(now.getTime() >= majority);
}
