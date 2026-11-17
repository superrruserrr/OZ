import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { openSignupForm } from '../../../../../../auth/actions';
import { authMetadata } from '../../../../../../auth/auth-metadata';
import { SignupForm } from '../../../../../../auth/signup-form';

export const generateMetadata = () => authMetadata('signup');

/**
 * Compte du tuteur (lot 1.7bc, D4) : un compte sans fiche joueur. Le rôle tuteur n'est accordé
 * qu'après la revue du justificatif de lien, jamais à l'inscription.
 */
export default async function GuardianSignupPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'guardian.signup' });
  const tSignup = await getTranslations({ locale, namespace: 'auth.signup' });
  const formToken = await openSignupForm();
  return (
    <section className="flex flex-col gap-6" data-testid="guardian-signup-page">
      <div>
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="mt-3 text-oz-text-muted">{t('lead')}</p>
      </div>
      {formToken ? (
        <SignupForm formToken={formToken} />
      ) : (
        <Callout testId="signup-unavailable">{tSignup('unavailable')}</Callout>
      )}
    </section>
  );
}
