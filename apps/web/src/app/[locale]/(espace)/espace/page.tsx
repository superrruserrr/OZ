import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { listOwnPhotos } from '../../../../espace/photo-actions';
import { PlayerDashboard } from '../../../../dashboard/player-dashboard';
import { loadOwn } from '../../../../espace/load-own';
import { isMinor } from '../../../../guardian/minor';
import { Link } from '../../../../i18n/navigation';
import { ownQrDataUri } from '../../../../onboarding/own-card';
import { countryName } from '../../../../players/country';
import { positionKey } from '../../../../players/labels';
import { DASHBOARD_PATH } from '../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('dashboard');

/**
 * Accueil de l'espace du joueur (lots 1.5ec et 1.19b, maquette v2) : tableau de bord relu sur l'API,
 * QR généré par le serveur du site ; un mineur voit le rôle de son tuteur et l'invite.
 */
export default async function EspaceHomePage() {
  const locale = await rootLocale();
  const [t, tGuardian, pos] = await Promise.all([
    getTranslations({ locale, namespace: 'espace.home' }),
    getTranslations({ locale, namespace: 'guardian.invite' }),
    getTranslations({ locale, namespace: 'onboarding.positions' }),
  ]);
  const own = await loadOwn(DASHBOARD_PATH, locale);
  if (own === null) {
    return <Callout testId="dashboard-unavailable">{t('unavailable')}</Callout>;
  }
  const minor = own.birthDate !== undefined && isMinor(own.birthDate);
  const photos = await listOwnPhotos();
  const photoId = photos.ok
    ? (photos.gallery.items.find((photo) => photo.isProfile && photo.status === 'clean')?.id ??
      null)
    : null;
  return (
    <section className="flex flex-col gap-6" data-testid="espace-home">
      {minor ? (
        <Callout tone="legal" testId="espace-minor-notice">
          {t('minor')}{' '}
          <Link
            href="/onboarding/invitation-tuteur"
            data-testid="guardian-invite-entry"
            className="inline-flex min-h-11 items-center font-medium underline"
          >
            {tGuardian('entry')}
          </Link>
        </Callout>
      ) : null}
      <PlayerDashboard
        profile={own}
        qr={own.ozId === undefined ? null : ownQrDataUri(own.ozId)}
        position={own.primaryPosition ? pos(positionKey(own.primaryPosition)) : null}
        country={own.country ? countryName(own.country, locale) : null}
        photoId={photoId}
      />
    </section>
  );
}
