/*
 * Message d'un champ d'inscription : clé `validation.*` du contrat (C1) ou code de l'API (C2). Un
 * message de Zod sans clé (champ vide, choix absent, nombre hors bornes) et un code inconnu reçoivent
 * un message générique, jamais le texte brut.
 */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'validation.name.invalid',
  'validation.name.tooLong',
  'validation.name.tooShort',
  'validation.email.invalid',
  'validation.email.tooLong',
  'validation.birthDate.invalid',
  'validation.birthDate.tooYoung',
  'validation.birthDate.tooOld',
  'validation.country.invalid',
  'validation.phone.invalid',
  'validation.position.duplicate',
  'validation.guardian.contactRequired',
]);

export function signupFieldMessageKey(code: string | undefined): string | null {
  if (!code) return null;
  if (KNOWN_KEYS.has(code)) return code;
  // `validation.text.tooLong` du contrat vise ici une région ou une ville (80 caractères).
  if (code === 'validation.text.tooLong') return 'onboarding.errors.tooLong';
  return 'onboarding.errors.required';
}

/** Valeur d'un sélecteur contrôlé : absente tant que rien n'est choisi (le formulaire peut être vide). */
export function valueProp(value: string | undefined): { value?: string } {
  return value ? { value } : {};
}

/** Clé de message d'une valeur de contrat en snake_case (`centre_back` → `centreBack`). */
export const messageKey = (value: string): string =>
  value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
