import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { openSignupForm } from '../../../../../../auth/actions';
import { authMetadata } from '../../../../../../auth/auth-metadata';
import { SignupForm } from '../../../../../../auth/signup-form';

export const generateMetadata = () => authMetadata('signup');

/** Écran 03, étape compte (lot 1.7ca, EX-107 n° 1) ; jeton de formulaire obtenu côté serveur. */
export default async function PlayerSignupPage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.signup' });
  const formToken = await openSignupForm();
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="mt-3 text-oz-text-muted">{t('lead')}</p>
      </div>
      {formToken ? (
        <SignupForm formToken={formToken} />
      ) : (
        <Callout testId="signup-unavailable">{t('unavailable')}</Callout>
      )}
    </section>
  );
}
