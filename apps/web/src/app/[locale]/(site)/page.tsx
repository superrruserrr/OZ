import { FloatingChip, PitchCircles } from '@oz/ui';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { Link } from '../../../i18n/navigation';
import { pageMetadata } from '../../../site/metadata';
import { PROFILE_SLUGS } from '../../../site/routes';

const PILLARS = ['identity', 'protection', 'network'] as const;

const PILLAR_DOTS = {
  identity: 'bg-oz-accent',
  protection: 'bg-oz-highlight',
  network: 'bg-oz-primary',
} as const satisfies Record<(typeof PILLARS)[number], string>;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata(locale, '/', t('title'), t('description'));
}

/**
 * Accueil (lot 1.6, EX-106) en registre Émotion sobre (design.md §8.2, ADR-009) : accroche rose,
 * cercles du terrain (E16) et puces des profils (E20), piliers, profils. Aucun chiffre ni logo de
 * tiers (M4, M5) ; aucun lien vers une page qui n'existe pas encore (inscriptions : lot 1.7).
 */
export default function HomePage() {
  const t = useTranslations('home');
  const s = useTranslations('site');
  const p = useTranslations('profiles');
  return (
    <>
      <section className="oz-rise relative isolate max-w-2xl">
        <PitchCircles className="absolute -top-10 -right-24 -z-10 size-72 sm:-right-64 sm:size-96" />
        <p className="text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase">
          {t('kicker')}
        </p>
        <h1 className="mt-4 font-display text-[31px] leading-[1.15] font-bold sm:text-[39px]">
          {t('title')} <span className="block text-oz-accent">{t('titleAccent')}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-oz-text-muted sm:text-lg">{t('lead')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <p
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-oz-surface-2 px-4 text-sm"
            data-testid="home-signup-soon"
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-oz-highlight" />
            {s('signupSoon')}
          </p>
          <Link
            href="/tarifs"
            data-testid="home-pricing-link"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-oz-primary underline underline-offset-4"
          >
            {t('pricingLink')}
          </Link>
        </div>
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
      <section aria-labelledby="profils" className="mt-16">
        <h2 id="profils" className="font-display text-2xl font-bold">
          {t('profilesTitle')}
        </h2>
        <p className="mt-2 max-w-xl text-oz-text-muted">{p('lead')}</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {PROFILE_SLUGS.map((slug, index) => (
            <li key={slug}>
              <Link
                href={`/profils/${slug}`}
                data-testid={`home-profile-${slug}`}
                className="inline-flex min-h-11 items-center"
              >
                <FloatingChip index={index}>{p(`items.${slug}.title`)}</FloatingChip>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
