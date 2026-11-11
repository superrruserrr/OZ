import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SiteFooter } from '../../../site/site-footer';
import { SiteHeader } from '../../../site/site-header';

/**
 * Gabarit des pages publiques (lot 1.6, refonte 1.5cba) : lien d'évitement, en-tête, contenu pleine
 * largeur (chaque page pose son conteneur, `SiteSection`), pied de page.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('site');
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-oz-surface-2 focus:px-4"
        data-testid="home-skip-link"
      >
        {t('skip')}
      </a>
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="w-full overflow-x-clip outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
