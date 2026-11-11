import { Button, Kicker, LivePanel, RoleCard, SplitHeading, StadiumHero, ValueCard } from '@oz/ui';
import type { RoleCardTone } from '@oz/ui';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { Link } from '../../../i18n/navigation';
import { pageMetadata } from '../../../site/metadata';
import { HomePreview } from '../../../site/home-preview';
import { HomeJsonLd } from '../../../site/json-ld';
import { PROFILE_SLUGS, type ProfileSlug } from '../../../site/routes';
import { SiteSection } from '../../../site/site-section';

/** Chaque pilier mène au profil qui l'illustre le mieux. */
const PILLARS = [
  ['identity', '/profils/joueur'],
  ['protection', '/profils/tuteur'],
  ['network', '/profils/recruteur'],
] as const;

const FACTS = ['player', 'minor', 'orgs'] as const;
const STEPS = ['create', 'verify', 'seen'] as const;
const FAQ = ['free', 'minor', 'who', 'verify', 'data'] as const;

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
  const a = useTranslations('about');
  const m = useTranslations('meta');
  return (
    <>
      <HomeJsonLd name={s('rights')} description={m('description')} />
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
        <section aria-labelledby="mission">
          <Kicker>{t('missionKicker')}</Kicker>
          <h2 id="mission" className="mt-3 font-display text-2xl font-medium sm:text-3xl">
            {t('missionTitle')}
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-oz-text-muted">{t('missionLead')}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6">
              <h3 className="font-display text-xl font-medium">{a('problemTitle')}</h3>
              <p className="mt-3 text-oz-text-muted">{a('problem')}</p>
            </div>
            <div className="rounded-2xl border border-oz-primary/35 bg-oz-primary/8 p-6">
              <h3 className="font-display text-xl font-medium">{a('answerTitle')}</h3>
              <p className="mt-3 text-oz-text-muted">{a('answer')}</p>
            </div>
          </div>
          <Link
            href="/a-propos"
            data-testid="home-mission-link"
            className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-oz-primary underline-offset-4 hover:underline"
          >
            {t('missionMore')} <Arrow />
          </Link>
        </section>
        <section
          aria-label={t('preview.label')}
          className="mt-20 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
        >
          <div className="flex max-w-xl flex-col items-start gap-5">
            <Kicker tone="highlight">{t('preview.kicker')}</Kicker>
            <SplitHeading
              as="h2"
              lead={t('preview.title')}
              highlight={t('preview.highlight')}
              breakBeforeHighlight
            />
            <p className="text-lg text-oz-text-muted">{t('preview.body')}</p>
          </div>
          <HomePreview />
        </section>
        <section aria-labelledby="etapes" className="mt-20">
          <Kicker>{t('stepsKicker')}</Kicker>
          <h2 id="etapes" className="mt-3 font-display text-2xl font-medium sm:text-3xl">
            {t('stepsTitle')}
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step}
                className="relative rounded-2xl border border-oz-border bg-oz-surface-1 p-6 before:mb-4 before:block before:h-1 before:w-10 before:rounded-full before:bg-oz-primary"
              >
                <h3 className="font-display text-xl font-medium">{t(`steps.${step}.title`)}</h3>
                <p className="mt-3 text-oz-text-muted">{t(`steps.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="piliers" className="mt-20">
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
        <section aria-labelledby="faq" className="mt-20 max-w-3xl">
          <Kicker tone="highlight">{t('faqKicker')}</Kicker>
          <h2 id="faq" className="mt-3 font-display text-2xl font-medium sm:text-3xl">
            {t('faqTitle')}
          </h2>
          <div className="mt-6 divide-y divide-oz-border rounded-2xl border border-oz-border bg-oz-surface-1">
            {FAQ.map((item) => (
              <details key={item} className="group px-5">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-medium text-oz-text [&::-webkit-details-marker]:hidden">
                  {t(`faq.${item}.q`)}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-4 shrink-0 text-oz-primary transition-transform duration-200 group-open:rotate-45"
                  >
                    <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                </summary>
                <p className="pb-5 text-oz-text-muted">{t(`faq.${item}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          aria-labelledby="appel"
          className="mt-20 flex flex-col items-start gap-5 rounded-3xl border border-oz-primary/35 bg-oz-primary/8 p-8 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="appel" className="font-display text-2xl font-medium sm:text-3xl">
              {t('ctaTitle')}
            </h2>
            <p className="mt-2 text-oz-text-muted">{t('ctaBody')}</p>
          </div>
          <Button asChild glow>
            <Link href="/auth/role" data-testid="home-signup-bottom">
              {s('signupCta')} <Arrow />
            </Link>
          </Button>
        </section>
      </SiteSection>
    </>
  );
}
