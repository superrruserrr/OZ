import { Kicker, PitchCircles, SplitHeading } from '@oz/ui';
import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '../components/locale-switcher';
import { Link } from '../i18n/navigation';

const PROMISES = ['id', 'control', 'minors'] as const;

/**
 * Coquille des écrans de compte (lot 1.5cbb, D1, ADR-012) : barre vitrée compacte (logo, langue),
 * fond « nuit de stade » dessiné en CSS, panneau de formulaire centré. Avec `aside`, une colonne
 * d'accroche (titre scindé et trois promesses, sans chiffre ni promesse de vérification, ADR-013)
 * s'ajoute à gauche à partir de 1024 px ; elle suit le panneau dans le DOM pour garder le `h1` de
 * la page en premier. Seuls `transform` et `opacity` bougent, en `motion-safe`.
 */
export function AuthFrame({ children, aside = false }: { children: ReactNode; aside?: boolean }) {
  const t = useTranslations('auth.layout');
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-1/3 -left-1/4 h-[80%] w-[70%] origin-top-left -rotate-12 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--oz-primary)_8%,transparent),transparent_68%)] motion-safe:animate-oz-breathe" />
        <div className="absolute -top-1/3 -right-1/4 h-[80%] w-[70%] origin-top-right rotate-12 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--oz-highlight)_6%,transparent),transparent_68%)] motion-safe:animate-oz-breathe motion-safe:[animation-delay:-2s]" />
        <PitchCircles className="absolute right-[-10rem] bottom-[-10rem] size-[22rem] lg:size-[36rem]" />
      </div>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-20 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-oz-surface-2 focus:px-4"
        data-testid="auth-skip-link"
      >
        {t('skip')}
      </a>
      <header className="sticky top-0 z-10 border-b border-oz-border bg-oz-bg/85 supports-backdrop-filter:backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Link
            href="/"
            aria-label={t('home')}
            className="inline-flex min-h-11 items-center"
            data-testid="auth-home-link"
          >
            <Logo alt="" className="h-10 max-sm:h-11" />
          </Link>
          <LocaleSwitcher />
        </div>
      </header>
      <main
        id="contenu"
        tabIndex={-1}
        className={
          aside
            ? 'mx-auto grid w-full max-w-6xl flex-1 gap-12 px-4 pt-8 pb-12 outline-none sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-start lg:pt-20'
            : 'mx-auto w-full max-w-xl flex-1 px-4 pt-8 pb-12 outline-none sm:px-6 sm:pt-12'
        }
      >
        <div
          data-testid="auth-panel"
          className="min-w-0 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-8 motion-safe:animate-oz-rise"
        >
          {children}
        </div>
        {aside ? (
          <aside
            data-testid="auth-aside"
            aria-label={t('asideLabel')}
            className="hidden flex-col items-start gap-6 lg:order-first lg:flex motion-safe:animate-oz-lift"
          >
            <Kicker>{t('kicker')}</Kicker>
            <SplitHeading
              as="h2"
              size="section"
              lead={t('titleLead')}
              highlight={t('titleHighlight')}
            />
            <ul className="flex flex-col gap-4 text-oz-text-muted">
              {PROMISES.map((key) => (
                <li key={key} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-oz-primary"
                  />
                  {t(`promises.${key}`)}
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </main>
    </div>
  );
}
