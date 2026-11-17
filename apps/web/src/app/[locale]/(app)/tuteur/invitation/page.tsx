import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { InvitationScreen } from '../../../../../guardian/invitation-screen';
import { readUnverifiedSession } from '../../../../../session/session';

export const generateMetadata = () => authMetadata('guardian');

/**
 * Invitation reçue par le tuteur (lot 1.7bc), ouverte sans compte. La présence d'une session ne sert
 * qu'à choisir les boutons ; l'API juge seule l'acceptation.
 */
export default async function GuardianInvitationPage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'guardian.invitation' });
  const session = await readUnverifiedSession();
  return (
    <section className="flex flex-col gap-6" data-testid="guardian-invitation-page">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <InvitationScreen signedIn={session !== null} />
    </section>
  );
}
