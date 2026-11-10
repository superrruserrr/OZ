import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { notFound } from 'next/navigation';
import { authMetadata } from '../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../auth/logout-button';
import { readUnverifiedSession } from '../../../../session/session';

export const generateMetadata = () => authMetadata('onboarding');

/** Attente protégée (lot 1.7ca), remplacée par le parcours d'inscription au lot 1.7cb. */
export default async function OnboardingPage() {
  // `proxy.ts` a déjà renvoyé à la connexion sans session : deuxième garde, sans détail.
  if ((await readUnverifiedSession()) === null) notFound();
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.onboarding' });
  return (
    <section className="flex flex-col gap-6" data-testid="onboarding-placeholder">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('lead')}</p>
      <LogoutButton />
    </section>
  );
}
