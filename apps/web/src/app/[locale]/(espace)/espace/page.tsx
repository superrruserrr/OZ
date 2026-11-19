import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { PlayerDashboard } from '../../../../dashboard/player-dashboard';
import { loadOwn } from '../../../../espace/load-own';
import { isMinor } from '../../../../guardian/minor';
import { Link } from '../../../../i18n/navigation';
import { OwnCard } from '../../../../onboarding/own-card';
import { DASHBOARD_PATH } from '../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('dashboard');

const link = 'inline-flex min-h-11 items-center font-medium underline';

/**
 * Accueil de l'espace du joueur (lots 1.5ec et 1.19b) : tableau de bord relu sur l'API, raccourcis
 * vers la visibilité et les données ; un mineur voit le rôle de son tuteur et l'invite.
 */
export default async function EspaceHomePage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'espace.home' });
  const tGuardian = await getTranslations({ locale, namespace: 'guardian.invite' });
  const own = await loadOwn(DASHBOARD_PATH, locale);
  if (own === null) {
    return <Callout testId="dashboard-unavailable">{t('unavailable')}</Callout>;
  }
  const minor = own.birthDate !== undefined && isMinor(own.birthDate);
  return (
    <section className="flex flex-col gap-6" data-testid="espace-home">
      <PlayerDashboard profile={own} />
      {own.ozId === undefined ? null : <OwnCard profile={own} ozId={own.ozId} locale={locale} />}
      {minor ? (
        <>
          <Callout tone="legal" testId="espace-minor-notice">
            {t('minor')}
          </Callout>
          <Link
            href="/onboarding/invitation-tuteur"
            data-testid="guardian-invite-entry"
            className={link}
          >
            {tGuardian('entry')}
          </Link>
        </>
      ) : null}
      <nav aria-label={t('shortcuts')} className="flex flex-wrap gap-x-6">
        <Link href="/espace/visibilite" data-testid="espace-to-visibility" className={link}>
          {t('toVisibility')}
        </Link>
        <Link href="/espace/donnees" data-testid="espace-to-data" className={link}>
          {t('toData')}
        </Link>
      </nav>
    </section>
  );
}
