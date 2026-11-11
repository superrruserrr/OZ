'use client';

import { SiteTopbar } from '@oz/ui';
import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '../components/locale-switcher';
import { Link, usePathname } from '../i18n/navigation';

const NAV = [
  ['/tarifs', 'pricing'],
  ['/a-propos', 'about'],
  ['/contact', 'contact'],
] as const;

/**
 * En-tête du site public (lot 1.6, refonte 1.5cba, ADR-012) : `SiteTopbar` vitré et collant, logo
 * vers l'accueil, liens principaux, connexion, création de compte en lime, langues ; feuille plein
 * écran sous 640 px. Composant client : le lien localisé est passé à la brique de `@oz/ui`.
 */
export function SiteHeader() {
  const t = useTranslations('site');
  const pathname = usePathname();
  const active = NAV.find(([href]) => pathname.startsWith(href))?.[1];
  return (
    <SiteTopbar
      brand={
        <Link href="/" className="inline-flex min-h-11 items-center" data-testid="site-home-link">
          <Logo alt={t('rights')} className="h-10 max-sm:h-12" />
        </Link>
      }
      navLabel={t('nav')}
      links={NAV.map(([href, key]) => ({ id: key, href, label: t(key) }))}
      activeId={active}
      menuLabel={t('menu')}
      closeLabel={t('close')}
      linkComponent={Link}
      actions={
        <>
          <Link
            href="/auth/login"
            data-testid="site-login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-oz-text-muted hover:text-oz-text"
          >
            {t('login')}
          </Link>
          <Link
            href="/auth/role"
            data-testid="site-signup"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-oz-primary px-4 text-sm font-medium text-oz-on-primary hover:bg-oz-primary-to"
          >
            {t('signupCta')}
          </Link>
          <LocaleSwitcher />
        </>
      }
    />
  );
}
