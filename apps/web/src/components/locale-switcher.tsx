import { useLocale, useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation';
import { routing } from '../i18n/routing';

/** Liens vers l'accueil de chaque langue ; chaque nom de langue est écrit dans sa propre langue. */
export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const current = useLocale();
  return (
    <nav aria-label={t('label')}>
      <ul className="flex gap-1">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Link
              href="/"
              locale={locale}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? 'true' : undefined}
              data-testid={`locale-switcher-${locale}`}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-oz-text-muted transition-colors hover:text-oz-text aria-[current=true]:text-oz-text aria-[current=true]:underline aria-[current=true]:decoration-oz-primary aria-[current=true]:underline-offset-4"
            >
              {t(locale)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
