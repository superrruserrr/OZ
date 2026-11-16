import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../auth/logout-button';
import { redirect } from '../../../../i18n/navigation';
import { Refused, toLogin, Unavailable } from '../../../../onboarding/load-draft';
import { OwnCard } from '../../../../onboarding/own-card';
import { readSignup } from '../../../../onboarding/signup-api';
import { nextPath, ONBOARDING_PATH } from '../../../../onboarding/steps';
import { readOwnPlayer } from '../../../../players/players-api';

export const generateMetadata = () => authMetadata('onboarding');

/**
 * Aiguillage du parcours (lot 1.7cb) : reprise à la première étape manquante d'après l'API
 * (EX-107 n° 2) ; inscription déjà finalisée → carte OZ ID relue sur l'API (D-133), avec son QR.
 */
export default async function OnboardingPage() {
  const locale = await rootLocale();
  const read = await readSignup();
  if (read.kind === 'unauthenticated') toLogin(ONBOARDING_PATH, locale);
  if (read.kind === 'refused') return <Refused />;
  if (read.kind === 'unavailable') return <Unavailable path={ONBOARDING_PATH} />;
  if (read.kind === 'draft') redirect({ href: nextPath(read.status), locale });
  const t = await getTranslations({ locale, namespace: 'onboarding.done' });
  const own = await readOwnPlayer();
  if (own.kind === 'unauthenticated') toLogin(ONBOARDING_PATH, locale);
  return (
    <section className="flex flex-col gap-6" data-testid="onboarding-done">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      {own.kind === 'ok' && own.data.ozId !== undefined ? (
        <OwnCard profile={own.data} ozId={own.data.ozId} locale={locale} />
      ) : own.kind === 'not_found' || own.kind === 'forbidden' ? (
        // État durable : ce compte n'a pas (encore) de fiche lisible, recharger n'y change rien.
        <p className="text-oz-text-muted" data-testid="onboarding-own-missing">
          {t('cardMissing')}
        </p>
      ) : (
        // Fiche momentanément illisible (panne, limite) : l'inscription reste acquise.
        <p className="text-oz-text-muted" data-testid="onboarding-own-unavailable">
          {t('cardUnavailable')}
        </p>
      )}
      <LogoutButton />
    </section>
  );
}
