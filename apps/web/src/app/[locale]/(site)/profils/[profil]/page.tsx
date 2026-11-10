import { CheckList } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { pageMetadata } from '../../../../../site/metadata';
import { isProfileSlug } from '../../../../../site/routes';

interface Props {
  params: Promise<{ profil: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profil } = await params;
  if (!isProfileSlug(profil)) return {};
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: `profiles.items.${profil}` });
  return pageMetadata(locale, `/profils/${profil}`, t('title'), t('lead'));
}

/** Page d'un profil (lot 1.6, EX-106 n° 1) : promesse, trois engagements, inscriptions annoncées. */
export default async function ProfilePage({ params }: Props) {
  const { profil } = await params;
  if (!isProfileSlug(profil)) notFound();
  const locale = await rootLocale();
  const [t, s] = await Promise.all([
    getTranslations({ locale, namespace: `profiles.items.${profil}` }),
    getTranslations({ locale, namespace: 'site' }),
  ]);
  return (
    <section className="max-w-2xl" data-testid={`profile-page-${profil}`}>
      <p className="text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase">
        {s('profiles')}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold">{t('title')}</h1>
      <p className="mt-4 text-lg text-oz-text-muted">{t('lead')}</p>
      <CheckList className="mt-8 gap-3 text-base" items={[t('p1'), t('p2'), t('p3')]} />
      <p className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-oz-surface-2 px-4 text-sm">
        <span aria-hidden="true" className="size-2 rounded-full bg-oz-highlight" />
        {s('signupSoon')}
      </p>
    </section>
  );
}
