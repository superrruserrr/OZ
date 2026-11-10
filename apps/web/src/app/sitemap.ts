import type { MetadataRoute } from 'next';
import { routing } from '../i18n/routing';
import { PUBLIC_PATHS } from '../site/routes';
import { localizedPath, siteUrl } from '../site/metadata';

export const dynamic = 'force-dynamic';

/*
 * Plan du site (EX-106 n° 2) : pages publiques seulement, en français et en anglais. Aucun profil de
 * joueur (EX-106 n° 3, EX-T16 n° 2). Vide hors production ou sans APP_URL (R10).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base || process.env.APP_ENV !== 'production') return [];
  return PUBLIC_PATHS.map((path) => ({
    url: new URL(localizedPath(routing.defaultLocale, path), base).toString(),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          new URL(localizedPath(locale, path), base).toString(),
        ]),
      ),
    },
  }));
}
