import { CheckList } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { pageMetadata } from '../../../../site/metadata';

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
    <article className="max-w-2xl">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="mt-4 text-lg text-oz-text-muted">{t('lead')}</p>
      <h2 className="mt-10 font-display text-xl font-bold">{t('problemTitle')}</h2>
      <p className="mt-2 text-oz-text-muted">{t('problem')}</p>
      <h2 className="mt-8 font-display text-xl font-bold">{t('answerTitle')}</h2>
      <p className="mt-2 text-oz-text-muted">{t('answer')}</p>
      <h2 className="mt-8 font-display text-xl font-bold">{t('principlesTitle')}</h2>
      <CheckList className="mt-3 gap-3 text-base" items={[t('p1'), t('p2'), t('p3')]} />
    </article>
  );
}
