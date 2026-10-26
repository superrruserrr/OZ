import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { locale as rootLocale } from 'next/root-params';
import { routing } from './routing';

export default getRequestConfig(async () => {
  // Hors segment [locale] (page 404 globale), la langue est celle choisie par le proxy next-intl
  // pour l'adresse demandée ; à défaut, la langue par défaut.
  // Typé `string` par Next, mais indéfini hors du segment [locale] (page 404 globale).
  const fromSegment = (await rootLocale()) as string | undefined;
  const requested = fromSegment ?? (await headers()).get('x-next-intl-locale') ?? undefined;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale, messages: messages.default };
});
