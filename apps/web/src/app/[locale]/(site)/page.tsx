import { Button, Kicker, LivePanel, RoleCard, SplitHeading, StadiumHero, ValueCard } from '@oz/ui';
import type { RoleCardTone } from '@oz/ui';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { Link } from '../../../i18n/navigation';
import { pageMetadata } from '../../../site/metadata';
import { PROFILE_SLUGS, type ProfileSlug } from '../../../site/routes';
import { SiteSection } from '../../../site/site-section';

/** Chaque pilier mène au profil qui l'illustre le mieux. */
const PILLARS = [
  ['identity', '/profils/joueur'],
  ['protection', '/profils/tuteur'],
  ['network', '/profils/recruteur'],
] as const;

const FACTS = ['player', 'minor', 'orgs'] as const;

/** Couleur de rôle (design.md §8.4 n° 5) : bleu (cadre légal) pour le tuteur, vert sinon. */
const ROLE_TONES: Record<ProfileSlug, RoleCardTone> = {
  joueur: 'player',
  tuteur: 'guardian',
  academie: 'organization',
  club: 'organization',
  federation: 'organization',
  centre: 'organization',
  recruteur: 'recruiter',
};

const Arrow = () => (
  <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata(locale, '/', t('title'), t('description'));
}

/**
 * Accueil (lot 1.6, refonte « sport » 1.5cba, ADR-011 et ADR-012) : héros de stade avec panneau
 * « en direct » (faits produit, aucun compteur : M5), engagements en cartes de valeur, profils en
 * cartes de rôle. Aucun chiffre ni logo de tiers (M4), aucun mineur mis en avant.
 */
export default function HomePage() {
  const t = useTranslations('home');
  const s = useTranslations('site');
  const p = useTranslations('profiles');
  return (
    <>
      <StadiumHero
        copy={
          <div className="flex max-w-xl flex-col items-start gap-6">
            <Kicker>{t('kicker')}</Kicker>
            <SplitHeading
              as="h1"
              size="hero"
              lead={t('title')}
              highlight={t('titleAccent')}
              breakBeforeHighlight
            />
            <p className="max-w-lg text-base leading-relaxed text-oz-text-muted sm:text-lg">
              {t('lead')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild glow>
                <Link href="/auth/role" data-testid="home-signup">
                  {s('signupCta')} <Arrow />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/tarifs" data-testid="home-pricing-link">
                  {t('pricingLink')}
                </Link>
              </Button>
            </div>
          </div>
        }
        aside={
          <div data-testid="home-live-panel">
            <LivePanel
              status={t('live.status')}
              title={t('live.title')}
              highlight={t('live.highlight')}
              facts={FACTS.map((fact) => ({
                label: t(`live.facts.${fact}.label`),
                value: t(`live.facts.${fact}.value`),
              }))}
            >
              {t('live.body')}
            </LivePanel>
          </div>
        }
      />
      <SiteSection>
        <section aria-labelledby="piliers">
          <Kicker tone="highlight">{t('pillarsKicker')}</Kicker>
          <h2 id="piliers" className="mt-3 font-display text-2xl font-medium sm:text-3xl">
            {t('pillarsTitle')}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {PILLARS.map(([pillar, href]) => (
              <li key={pillar}>
                <ValueCard
                  href={href}
                  title={t(`pillars.${pillar}.title`)}
                  cta={p('more')}
                  linkComponent={Link}
                >
                  {t(`pillars.${pillar}.body`)}
                </ValueCard>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="profils" className="mt-20">
          <Kicker>{t('profilesKicker')}</Kicker>
          <h2 id="profils" className="mt-3 font-display text-2xl font-medium sm:text-3xl">
            {t('profilesTitle')}
          </h2>
          <p className="mt-3 max-w-xl text-oz-text-muted">{p('lead')}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROFILE_SLUGS.map((slug) => (
              <li key={slug}>
                <RoleCard
                  href={`/profils/${slug}`}
                  title={p(`items.${slug}.title`)}
                  subtitle={p(`items.${slug}.lead`)}
                  tone={ROLE_TONES[slug]}
                  linkComponent={Link}
                />
              </li>
            ))}
          </ul>
        </section>
      </SiteSection>
    </>
  );
}
