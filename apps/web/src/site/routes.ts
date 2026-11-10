/*
 * Pages publiques (lot 1.6, EX-106). La planche §8.8 fixe `/legal/cgu` et `/legal/confidentialite` ;
 * les autres sont ajoutées dans sa logique (décision D1 du lot, design.md §8.8).
 */
export const PROFILE_SLUGS = [
  'joueur',
  'tuteur',
  'academie',
  'club',
  'federation',
  'centre',
  'recruteur',
] as const;
export type ProfileSlug = (typeof PROFILE_SLUGS)[number];

export const LEGAL_DOCS = {
  cgu: 'cgu.md',
  confidentialite: 'politique-confidentialite.md',
  mentions: 'mentions-legales.md',
} as const;
export type LegalDoc = keyof typeof LEGAL_DOCS;

export const PUBLIC_PATHS = [
  '/',
  '/tarifs',
  '/a-propos',
  '/contact',
  ...PROFILE_SLUGS.map((slug) => `/profils/${slug}`),
  ...Object.keys(LEGAL_DOCS).map((doc) => `/legal/${doc}`),
] as const;

/** Lien d'un texte légal vers un autre : seulement entre textes légaux du site. */
export function legalHref(href: string): string | undefined {
  const entry = Object.entries(LEGAL_DOCS).find(([, file]) => file === href);
  return entry ? `/legal/${entry[0]}` : undefined;
}

export function isProfileSlug(value: string): value is ProfileSlug {
  return (PROFILE_SLUGS as readonly string[]).includes(value);
}

export function isLegalDoc(value: string): value is LegalDoc {
  return Object.hasOwn(LEGAL_DOCS, value);
}
