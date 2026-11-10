import type { Metadata } from 'next';
import { routing } from '../i18n/routing';

/** Adresse publique du site (variable d'environnement, jamais en dur) ; absente : URL relatives. */
export function siteUrl(): URL | undefined {
  const value = process.env.APP_URL;
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/** Chemin localisé : français sans préfixe, anglais sous `/en` (routing `as-needed`). */
export function localizedPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/** Métadonnées d'une page publique : titre, description, langues alternatives, Open Graph. */
export function pageMetadata(
  locale: string,
  path: string,
  title: string,
  description: string,
): Metadata {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, localizedPath(l, path)]));
  return {
    title,
    description,
    alternates: { canonical: localizedPath(locale, path), languages },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'OZ Football ID',
      locale: locale === 'fr' ? 'fr_FR' : 'en_GB',
      url: localizedPath(locale, path),
    },
    twitter: { card: 'summary', title, description },
  };
}
