import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '../components/locale-switcher';
import { Link } from '../i18n/navigation';

const NAV = [
  ['/tarifs', 'pricing'],
  ['/a-propos', 'about'],
  ['/contact', 'contact'],
] as const;

/** En-tête du site public (lot 1.6) : logo vers l'accueil, liens principaux (≥ 640 px), langues. */
export function SiteHeader() {
  const t = useTranslations('site');
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3">
      <Link href="/" className="inline-flex min-h-11 items-center" data-testid="site-home-link">
        <Logo alt={t('rights')} />
      </Link>
      <div className="flex items-center gap-2">
        <nav aria-label={t('nav')} className="hidden sm:block">
          <ul className="flex gap-1">
            {NAV.map(([href, key]) => (
              <li key={href}>
                <Link
                  href={href}
                  data-testid={`site-nav-${key}`}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-oz-text-muted hover:text-oz-text"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
