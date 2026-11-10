import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../auth/logout-button';
import { redirect } from '../../../../i18n/navigation';
import { Refused, toLogin, Unavailable } from '../../../../onboarding/load-draft';
import { readSignup } from '../../../../onboarding/signup-api';
import { nextPath, ONBOARDING_PATH } from '../../../../onboarding/steps';

export const generateMetadata = () => authMetadata('onboarding');

/**
 * Aiguillage du parcours (lot 1.7cb) : reprise à la première étape manquante d'après l'API
 * (EX-107 n° 2) ; inscription déjà finalisée → écran d'attente de l'espace joueur (lot 1.8).
 */
export default async function OnboardingPage() {
  const locale = await rootLocale();
  const read = await readSignup();
  if (read.kind === 'unauthenticated') toLogin(ONBOARDING_PATH, locale);
  if (read.kind === 'refused') return <Refused />;
  if (read.kind === 'unavailable') return <Unavailable path={ONBOARDING_PATH} />;
  if (read.kind === 'draft') redirect({ href: nextPath(read.status), locale });
  const t = await getTranslations({ locale, namespace: 'onboarding.done' });
  return (
    <section className="flex flex-col gap-6" data-testid="onboarding-done">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('lead')}</p>
      <LogoutButton />
    </section>
  );
}
