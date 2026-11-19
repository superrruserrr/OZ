import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../auth/logout-button';
import { PlayerDashboard } from '../../../../dashboard/player-dashboard';
import { toLogin } from '../../../../onboarding/load-draft';
import { readOwnPlayer } from '../../../../players/players-api';
import { DASHBOARD_PATH, localized } from '../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('dashboard');

/**
 * Tableau de bord du joueur (lot 1.5ec), route `/espace` reprise par 1.19b dans le groupe `(espace)` : sa fiche relue sur l'API à chaque rendu. Un compte sans
 * fiche joueur (inscription en cours, tuteur) repart vers les premiers pas.
 */
export default async function DashboardPage() {
  const locale = await rootLocale();
  const read = await readOwnPlayer();
  if (read.kind === 'unauthenticated') toLogin(DASHBOARD_PATH, locale);
  if (read.kind === 'not_found' || read.kind === 'forbidden')
    redirect(localized(locale, '/onboarding'));
  if (read.kind !== 'ok') {
    const t = await getTranslations({ locale, namespace: 'dashboard' });
    return (
      <section className="flex flex-col gap-6">
        <Callout testId="dashboard-unavailable">{t('unavailable')}</Callout>
        <LogoutButton />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-6">
      <PlayerDashboard profile={read.data} />
      <LogoutButton />
    </section>
  );
}
