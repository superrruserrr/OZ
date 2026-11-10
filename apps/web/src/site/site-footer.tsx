import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation';
import { PROFILE_SLUGS } from './routes';

/** Bande aux couleurs du logo (charte, ADR-009) : rose, turquoise, vert, encre. */
const BAND = ['bg-oz-accent', 'bg-oz-highlight', 'bg-oz-primary', 'bg-oz-text'] as const;

const linkClass =
  'inline-flex min-h-11 items-center text-sm text-oz-text-muted underline-offset-4 hover:text-oz-text hover:underline';

/** Pied de page du site public (lot 1.6) : profils, site, informations légales. */
export function SiteFooter() {
  const t = useTranslations('site');
  const p = useTranslations('profiles.items');
  return (
    <footer aria-label={t('footer')} className="mt-16 border-t border-oz-border">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 sm:grid-cols-3">
        <nav aria-label={t('profiles')}>
          <h2 className="text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase">
            {t('profiles')}
          </h2>
          <ul className="mt-2">
            {PROFILE_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  href={`/profils/${slug}`}
                  className={linkClass}
                  data-testid={`footer-profile-${slug}`}
                >
                  {p(`${slug}.title`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('nav')}>
          <h2 className="text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase">
            {t('rights')}
          </h2>
          <ul className="mt-2">
            <li>
              <Link href="/tarifs" className={linkClass} data-testid="footer-pricing">
                {t('pricing')}
              </Link>
            </li>
            <li>
              <Link href="/a-propos" className={linkClass} data-testid="footer-about">
                {t('about')}
              </Link>
            </li>
            <li>
              <Link href="/contact" className={linkClass} data-testid="footer-contact">
                {t('contact')}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t('legal')}>
          <h2 className="text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase">
            {t('legal')}
          </h2>
          <ul className="mt-2">
            <li>
              <Link href="/legal/mentions" className={linkClass} data-testid="footer-legal-notice">
                {t('legalNotice')}
              </Link>
            </li>
            <li>
              <Link
                href="/legal/confidentialite"
                className={linkClass}
                data-testid="footer-privacy"
              >
                {t('privacy')}
              </Link>
            </li>
            <li>
              <Link href="/legal/cgu" className={linkClass} data-testid="footer-terms">
                {t('terms')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div aria-hidden="true" className="flex h-1.5" data-testid="home-brand-band">
        {BAND.map((color) => (
          <span key={color} className={`flex-1 ${color}`} />
        ))}
      </div>
    </footer>
  );
}
