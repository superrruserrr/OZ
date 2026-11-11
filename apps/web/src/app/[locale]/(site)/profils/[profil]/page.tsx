import { Button, CheckList, Kicker, SplitHeading } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { Link } from '../../../../../i18n/navigation';
import { pageMetadata } from '../../../../../site/metadata';
import { isProfileSlug } from '../../../../../site/routes';
import { SiteSection } from '../../../../../site/site-section';

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

/**
 * Page d'un profil (lot 1.6, refonte 1.5cba) : promesse, trois engagements, appel à l'inscription
 * (joueur, seul ouvert, lot 1.7cb) ou inscriptions annoncées. Tuteur en bleu : cadre légal (§8.4 n° 2).
 */
export default async function ProfilePage({ params }: Props) {
  const { profil } = await params;
  if (!isProfileSlug(profil)) notFound();
  const locale = await rootLocale();
  const [t, s] = await Promise.all([
    getTranslations({ locale, namespace: `profiles.items.${profil}` }),
    getTranslations({ locale, namespace: 'site' }),
  ]);
  return (
    <SiteSection>
      <section
        className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start"
        data-testid={`profile-page-${profil}`}
      >
        <div className="flex max-w-2xl flex-col items-start gap-5">
          <Kicker tone={profil === 'tuteur' ? 'highlight' : 'primary'}>{s('profiles')}</Kicker>
          <SplitHeading as="h1" size="hero" lead={t('title')} />
          <p className="text-lg text-oz-text-muted">{t('lead')}</p>
          {profil === 'joueur' ? (
            <Button asChild glow className="mt-2">
              <Link href="/auth/role" data-testid="profile-signup">
                {s('signupCta')}
              </Link>
            </Button>
          ) : (
            <p
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-oz-border bg-oz-surface-1 px-4 text-sm"
              data-testid="profile-signup-soon"
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-oz-highlight" />
              {s('signupSoonProfile')}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6">
          <CheckList className="gap-4 text-base" items={[t('p1'), t('p2'), t('p3')]} />
        </div>
      </section>
    </SiteSection>
  );
}
