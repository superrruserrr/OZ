// Point d'entrée dédié : le barrel @oz/ui contient des composants client (Modal…).
import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '../../components/locale-switcher';

const PILLARS = ['identity', 'protection', 'network'] as const;

const PILLAR_DOTS = {
  identity: 'bg-oz-accent',
  protection: 'bg-oz-highlight',
  network: 'bg-oz-primary',
} as const satisfies Record<(typeof PILLARS)[number], string>;

/** Bandeau aux couleurs du logo (charte, ADR-009) : rose, turquoise, vert, encre. */
const BAND = ['bg-oz-accent', 'bg-oz-highlight', 'bg-oz-primary', 'bg-oz-text'] as const;

/**
 * Accueil provisoire (EX-004.3) en registre Émotion sobre (design.md §8.2, ADR-009) : logo de la
 * charte, accroche rose, aucun chiffre ni logo de tiers (M4, M5), aucun lien vers une page qui
 * n'existe pas encore.
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
        <Logo alt={t('brand')} />
        <LocaleSwitcher />
      </header>
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-5 pt-12 pb-16 sm:pt-20"
      >
        <section className="oz-rise max-w-2xl">
          <p className="text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase">
            {t('kicker')}
          </p>
          <h1 className="mt-4 font-display text-[31px] leading-[1.15] font-bold sm:text-[39px]">
            {t('title')} <span className="block text-oz-accent">{t('titleAccent')}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-oz-text-muted sm:text-lg">{t('lead')}</p>
          <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-oz-surface-2 px-4 py-2 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-oz-highlight" />
            {t('status')}
          </p>
        </section>
        <section aria-labelledby="piliers" className="mt-16">
          <h2 id="piliers" className="sr-only">
            {t('pillarsTitle')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <li key={pillar} className="rounded-2xl bg-oz-surface-2 p-5">
                <span
                  aria-hidden="true"
                  className={`block size-4 rounded-full ${PILLAR_DOTS[pillar]}`}
                />
                <h3 className="mt-3 font-display text-xl leading-[1.3] font-bold">
                  {t(`pillars.${pillar}.title`)}
                </h3>
                <p className="mt-2 text-sm text-oz-text-muted">{t(`pillars.${pillar}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <div aria-hidden="true" className="flex h-1.5" data-testid="home-brand-band">
        {BAND.map((color) => (
          <span key={color} className={`flex-1 ${color}`} />
        ))}
      </div>
    </>
  );
}
