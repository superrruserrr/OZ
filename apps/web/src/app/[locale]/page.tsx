import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '../../components/locale-switcher';

const PILLARS = ['identity', 'protection', 'network'] as const;

/**
 * Accueil provisoire (EX-004.3) en registre Émotion sobre (design.md §8.2) : accroche lime (E17),
 * aucun chiffre ni logo de tiers (M4, M5), aucun lien vers une page qui n'existe pas encore.
 */
export default function HomePage() {
  const t = useTranslations('home');
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-oz-surface-2 focus:px-4"
        data-testid="home-skip-link"
      >
        {t('skipLink')}
      </a>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-3">
        <p className="font-display text-2xl font-extrabold tracking-tight italic">{t('brand')}</p>
        <LocaleSwitcher />
      </header>
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-5 pt-12 pb-16 sm:pt-20"
      >
        <section className="oz-rise max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.08em] text-oz-text-label uppercase">
            {t('kicker')}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-6xl">
            {t('title')} <span className="oz-neon block text-oz-lime">{t('titleAccent')}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-oz-text-muted sm:text-lg">{t('lead')}</p>
          <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-oz-border bg-oz-surface-2 px-4 py-2 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-oz-primary" />
            {t('status')}
          </p>
        </section>
        <section aria-labelledby="piliers" className="mt-16">
          <h2 id="piliers" className="sr-only">
            {t('pillarsTitle')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <li key={pillar} className="rounded-2xl border border-oz-border bg-oz-surface-1 p-5">
                <h3 className="font-display text-lg font-bold tracking-tight">
                  {t(`pillars.${pillar}.title`)}
                </h3>
                <p className="mt-2 text-sm text-oz-text-muted">{t(`pillars.${pillar}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
