import { CheckList, Kicker, SplitHeading } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { pageMetadata } from '../../../../site/metadata';
import { SiteSection } from '../../../../site/site-section';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'about' });
  return pageMetadata(locale, '/a-propos', t('title'), t('lead'));
}

/** À propos (lot 1.6, EX-106 n° 1) : problème, réponse, principes ; aucun chiffre (M5). */
export default async function AboutPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'about' });
  return (
    <SiteSection>
      <article>
        <div className="flex max-w-2xl flex-col items-start gap-5">
          <Kicker>{t('kickerLabel')}</Kicker>
          <SplitHeading as="h1" size="hero" lead={t('title')} />
          <p className="text-lg text-oz-text-muted">{t('lead')}</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <section className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6">
            <h2 className="font-display text-xl font-medium">{t('problemTitle')}</h2>
            <p className="mt-3 text-oz-text-muted">{t('problem')}</p>
          </section>
          <section className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6">
            <h2 className="font-display text-xl font-medium">{t('answerTitle')}</h2>
            <p className="mt-3 text-oz-text-muted">{t('answer')}</p>
          </section>
          <section className="rounded-2xl border border-oz-primary/35 bg-oz-primary/8 p-6">
            <h2 className="font-display text-xl font-medium">{t('principlesTitle')}</h2>
            <CheckList className="mt-3 gap-3 text-base" items={[t('p1'), t('p2'), t('p3')]} />
          </section>
        </div>
      </article>
    </SiteSection>
  );
}
