import { defineRouting } from 'next-intl/routing';

/**
 * Langues du site (EX-T21.3) : français par défaut, sans préfixe ; anglais sous `/en`.
 * Ni détection par la langue du navigateur ni cookie : l'adresse seule fixe la langue.
 */
export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
