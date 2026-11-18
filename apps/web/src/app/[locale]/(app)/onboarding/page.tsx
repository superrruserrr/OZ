import { SplitHeading } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../auth/logout-button';
import { readChildren } from '../../../../guardian/guardian-api';
import { isMinor } from '../../../../guardian/minor';
import { Link, redirect } from '../../../../i18n/navigation';
import { Refused, toLogin, Unavailable } from '../../../../onboarding/load-draft';
import { OwnCard } from '../../../../onboarding/own-card';
import { readSignup } from '../../../../onboarding/signup-api';
import { nextPath, ONBOARDING_PATH } from '../../../../onboarding/steps';
import { readOwnPlayer } from '../../../../players/players-api';
import { DIRECTORY_PATH, GUARDIAN_SPACE_PATH } from '../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('onboarding');

/**
 * Aiguillage du parcours (lot 1.7cb) : reprise à la première étape manquante d'après l'API
 * (EX-107 n° 2) ; inscription déjà finalisée → carte OZ ID relue sur l'API (D-133), avec son QR ;
 * compte sans fiche joueur → espace du tuteur ou annuaire (lot 1.19a).
 */
export default async function OnboardingPage() {
  const locale = await rootLocale();
  const read = await readSignup();
  if (read.kind === 'unauthenticated') toLogin(ONBOARDING_PATH, locale);
  if (read.kind === 'refused') {
    // Compte refusé comme joueur mais tuteur d'un enfant : son espace.
    const children = await readChildren();
    if (children.kind === 'ok' && children.children.length > 0) {
      redirect({ href: GUARDIAN_SPACE_PATH, locale });
    }
    return <Refused />;
  }
  if (read.kind === 'unavailable') return <Unavailable path={ONBOARDING_PATH} />;
  if (read.kind === 'draft') {
    // Compte de tuteur sans fiche joueur entamée (lot 1.7bc) : son espace, pas le parcours joueur.
    const untouched = Object.values(read.status.steps).every((step) => step === null);
    if (untouched) {
      const children = await readChildren();
      if (children.kind === 'ok' && children.children.length > 0) {
        redirect({ href: GUARDIAN_SPACE_PATH, locale });
      }
    }
    redirect({ href: nextPath(read.status), locale });
  }
  const t = await getTranslations({ locale, namespace: 'onboarding.done' });
  const tGuardian = await getTranslations({ locale, namespace: 'guardian.invite' });
  const own = await readOwnPlayer();
  if (own.kind === 'unauthenticated') toLogin(ONBOARDING_PATH, locale);
  if (own.kind === 'not_found') {
    // Compte sans fiche joueur (lot 1.19a) : le tuteur va à son espace, un autre rôle à l'annuaire,
    // jamais sur « Votre profil joueur est créé ». L'API refait ses contrôles sur chaque écran.
    const children = await readChildren();
    redirect({
      href:
        children.kind === 'ok' && children.children.length > 0
          ? GUARDIAN_SPACE_PATH
          : DIRECTORY_PATH,
      locale,
    });
  }
  return (
    <section className="flex flex-col gap-6" data-testid="onboarding-done">
      <SplitHeading as="h1" lead={t('title')} />
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
      {own.kind === 'ok' && isMinor(own.data.birthDate) ? (
        <Link
          href="/onboarding/invitation-tuteur"
          data-testid="guardian-invite-entry"
          className="inline-flex min-h-11 items-center font-medium underline"
        >
          {tGuardian('entry')}
        </Link>
      ) : null}
      <LogoutButton />
    </section>
  );
}
