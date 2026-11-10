import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { Link } from '../../../i18n/navigation';

/** Écrans de compte (lot 1.7ca) : registre Pilotage, sans menu marketing ni pied de site. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('auth.layout');
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-oz-surface-2 focus:px-4"
        data-testid="auth-skip-link"
      >
        {t('skip')}
      </a>
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-5 py-3">
        <Link
          href="/"
          aria-label={t('home')}
          className="inline-flex min-h-11 items-center"
          data-testid="auth-home-link"
        >
          <Logo alt="" />
        </Link>
        <LocaleSwitcher />
      </header>
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-xl overflow-x-clip px-5 pt-6 pb-12 outline-none"
      >
        {children}
      </main>
    </>
  );
}
