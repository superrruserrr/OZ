import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { openSignupForm } from '../../../../../../auth/actions';
import { AuthHeading } from '../../../../../../auth/auth-heading';
import { authMetadata } from '../../../../../../auth/auth-metadata';
import { SignupForm } from '../../../../../../auth/signup-form';

export const generateMetadata = () => authMetadata('signup');

/** Écran 03, étape compte (lot 1.7ca, EX-107 n° 1) ; jeton de formulaire obtenu côté serveur. */
export default async function PlayerSignupPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.signup' });
  const k = await getTranslations({ locale, namespace: 'auth.kickers' });
  const formToken = await openSignupForm();
  return (
    <section className="flex flex-col gap-6">
      <AuthHeading kicker={k('player')} title={t('title')} lead={t('lead')} />
      {formToken ? (
        <SignupForm formToken={formToken} />
      ) : (
        <Callout testId="signup-unavailable">{t('unavailable')}</Callout>
      )}
    </section>
  );
}
