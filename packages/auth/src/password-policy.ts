/** Longueur minimale (EX-103 n° 2) : seule exigence, aucune règle de composition arbitraire. */
export const PASSWORD_MIN_LENGTH = 12;
/** Longueur maximale : borne le coût du hachage et la taille des requêtes. */
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyCode =
  | 'AUTH_PASSWORD_TOO_SHORT'
  | 'AUTH_PASSWORD_TOO_LONG'
  | 'AUTH_PASSWORD_MALFORMED'
  /** Présent dans HaveIBeenPwned : posé par l'appelant après `PwnedPasswordsClient.check`. */
  | 'AUTH_PASSWORD_BREACHED';

/**
 * Taille maximale acceptée par les primitives, en unités UTF-16 (4 par caractère au pire) : borne
 * le coût de la normalisation et du hachage, même là où la politique ne s'applique pas (connexion).
 */
export const PASSWORD_MAX_INPUT_UNITS = PASSWORD_MAX_LENGTH * 4;

// Moitié de paire de substitution isolée : l'encodage UTF-8 la remplacerait par U+FFFD, et deux
// mots de passe différents donneraient le même hash.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** Vrai si la chaîne est de l'Unicode bien formé et de taille raisonnable. */
export function isAcceptablePasswordInput(password: string): boolean {
  return password.length <= PASSWORD_MAX_INPUT_UNITS && !LONE_SURROGATE.test(password);
}

/**
 * Forme canonique d'un mot de passe : NFKC, pour qu'un même mot de passe saisi sur deux claviers
 * (accent composé ou décomposé, chiffres pleine chasse) donne le même hash.
 */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/** Nombre de caractères (points de code) après normalisation, pas d'unités UTF-16. */
export function passwordLength(password: string): number {
  return Array.from(normalizePassword(password)).length;
}

/** `null` si le mot de passe respecte la politique, sinon le code d'erreur. */
export function checkPasswordPolicy(password: string): PasswordPolicyCode | null {
  if (password.length > PASSWORD_MAX_INPUT_UNITS) return 'AUTH_PASSWORD_TOO_LONG';
  if (LONE_SURROGATE.test(password)) return 'AUTH_PASSWORD_MALFORMED';
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH) return 'AUTH_PASSWORD_TOO_SHORT';
  if (length > PASSWORD_MAX_LENGTH) return 'AUTH_PASSWORD_TOO_LONG';
  return null;
}
