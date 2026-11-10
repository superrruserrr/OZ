/*
 * Message d'un champ : clé `validation.*` du schéma partagé (C1), ou code renvoyé par l'API (C2,
 * `details[].code`). Un code inconnu reçoit un message générique, jamais le code brut.
 */
const API_CODES: Readonly<Record<string, string>> = {
  required: 'validation.password.required',
  AUTH_PASSWORD_TOO_SHORT: 'validation.password.tooShort',
  AUTH_PASSWORD_TOO_LONG: 'validation.password.tooLong',
  AUTH_PASSWORD_MALFORMED: 'validation.password.invalid',
  AUTH_PASSWORD_BREACHED: 'auth.errors.passwordBreached',
};

/** Clés `validation.*` des schémas de compte présentes dans les messages du site. */
const KNOWN_VALIDATION_KEYS: ReadonlySet<string> = new Set([
  'validation.email.invalid',
  'validation.email.tooLong',
  'validation.password.required',
  'validation.password.tooShort',
  'validation.password.tooLong',
  'validation.password.invalid',
  'validation.token.invalid',
]);

export function fieldMessageKey(field: string, code: string | undefined): string | null {
  if (!code) return null;
  if (KNOWN_VALIDATION_KEYS.has(code)) return code;
  if (code === 'required' && field === 'email') return 'validation.email.invalid';
  return API_CODES[code] ?? 'auth.errors.invalid';
}
