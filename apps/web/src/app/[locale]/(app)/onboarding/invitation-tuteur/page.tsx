import { SplitHeading } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../../auth/logout-button';
import { InvitePanel } from '../../../../../guardian/invite-panel';
import { Link } from '../../../../../i18n/navigation';
import { ONBOARDING_PATH } from '../../../../../onboarding/steps';

export const generateMetadata = () => authMetadata('onboarding');

/**
 * Le joueur mineur invite son parent ou tuteur légal (lot 1.7bc, B5). L'API décide seule si
 * l'invitation s'applique à ce compte (mineur, tuteur déclaré, pas encore rattaché).
 */
export default async function GuardianInvitePage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'guardian.invite' });
  return (
    <section className="flex flex-col gap-6" data-testid="guardian-invite-page">
      <div>
        <SplitHeading as="h1" lead={t('title')} />
        <p className="mt-3 text-oz-text-muted">{t('lead')}</p>
      </div>
      <InvitePanel />
      <Link href={ONBOARDING_PATH} className="inline-flex min-h-11 items-center underline">
        {t('back')}
      </Link>
      <LogoutButton />
    </section>
  );
}
