import { z } from 'zod';

// Briques réutilisables des contrats. Les messages sont des clés i18n, traduites par l'interface.

/** Caractère de contrôle C0 ou C1, hors tabulation et retours à la ligne. */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isC0 = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (isC0 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

// Commandes d'inversion bidirectionnelle (attaques « Trojan Source »).
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/;
// Demi-paire de substitution isolée (chaîne UTF-16 mal formée).
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// Remplissages coréens : des lettres au sens d'Unicode, mais invisibles.
const HANGUL_FILLER = /[\u115F\u1160\u3164\uFFA0]/;
// Ni lisible ni porteur de sens : espaces, formats, signes combinants isolés, remplissages, braille vide.
const INVISIBLE = /[\s\p{Cf}\p{M}\u115F\u1160\u3164\uFFA0\u2800]/gu;

// Signes combinants sans rendu visible : joint de graphèmes, sélecteurs de variante, voyelles khmères muettes.
const INVISIBLE_MARK = /[\u034F\u17B4\u17B5\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;
// Caractères « tag » : permettent de cacher du texte ASCII invisible (instructions à une IA…).
const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u;

/** Adresse email normalisée (espaces de bord retirés, minuscules), 254 caractères, partie locale ≤ 64. */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: 'validation.email.tooLong' })
  .refine((value) => (value.split('@')[0] ?? '').length <= 64, {
    error: 'validation.email.invalid',
  })
  .pipe(z.email({ error: 'validation.email.invalid' }));

// Mot : une lettre puis lettres et signes combinants (langues indiennes…).
// Antiliant / liant (ZWNJ, ZWJ) admis seulement entre deux lettres, jamais en série ni en fin de mot.
const WORD = String.raw`\p{L}(?:[\p{L}\p{M}]|[\u200C\u200D](?=\p{L}))*`;
// Séparateur unique entre deux mots : espace, trait d'union, apostrophe droite ou typographique,
// ou point d'initiale suivi d'un espace facultatif (« J. R. Tolkien »).
const NAME = new RegExp(String.raw`^${WORD}(?:(?:[ '’-]|\. ?)${WORD})*\.?$`, 'u');

/**
 * Nom de personne de toutes langues, normalisé en NFC, 1 à 100 caractères. Refuse chiffres,
 * symboles, séparateurs successifs, caractères de contrôle et empilements de diacritiques.
 */
export const personName = z
  .string()
  .trim()
  .normalize('NFC')
  .min(1, { error: 'validation.name.tooShort' })
  .max(100, { error: 'validation.name.tooLong' })
  .regex(NAME, { error: 'validation.name.invalid' })
  .refine(
    (value) => {
      if (INVISIBLE_MARK.test(value)) return false;
      if (HANGUL_FILLER.test(value) || /\p{M}{3,}/u.test(value)) return false;
      // Pas plus de signes combinants que de lettres : refuse les empilements (Zalgo) même par deux.
      // Compté en forme décomposée (NFD) : NFC fusionne le premier signe dans la lettre (á).
      const decomposed = value.normalize('NFD');
      const marks = decomposed.match(/\p{M}/gu)?.length ?? 0;
      const letters = decomposed.match(/\p{L}/gu)?.length ?? 0;
      return marks <= letters;
    },
    { error: 'validation.name.invalid' },
  );

/**
 * Texte libre borné, espaces de bord retirés. La longueur minimale porte sur les caractères visibles
 * (hors espaces, formats, signes combinants, remplissages coréens et braille vide) ;
 * contrôles, inversions bidirectionnelles, caractères « tag » et chaînes UTF-16 mal formées sont refusés.
 */
export function longText(min: number, max: number): z.ZodString {
  return z
    .string()
    .trim()
    .max(max, { error: 'validation.text.tooLong' })
    .refine(
      (value) =>
        !hasControlCharacter(value) &&
        !BIDI_CONTROL.test(value) &&
        !LONE_SURROGATE.test(value) &&
        !TAG_CHARACTER.test(value),
      { error: 'validation.text.invalidCharacters' },
    )
    .refine((value) => value.replace(INVISIBLE, '').length >= min, {
      error: 'validation.text.tooShort',
    });
}

/** Consentement explicite : seule la valeur `true` est acceptée. */
export const consent = z.literal(true, { error: 'validation.consent.required' });
