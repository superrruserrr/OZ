import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { loadOwn } from '../../../../../espace/load-own';
import { OwnProfile } from '../../../../../espace/own-profile';
import { countryName } from '../../../../../players/country';
import { positionKey } from '../../../../../players/labels';

export const generateMetadata = () => authMetadata('dashboard');

/** Mon profil (maquette v2) : la fiche du titulaire relue sur l'API, rubrique par rubrique. */
export default async function OwnProfilePage() {
  const locale = await rootLocale();
  const [t, pos] = await Promise.all([
    getTranslations({ locale, namespace: 'espace.home' }),
    getTranslations({ locale, namespace: 'onboarding.positions' }),
  ]);
  const own = await loadOwn('/espace/profil', locale);
  if (own === null) return <Callout testId="own-profile-unavailable">{t('unavailable')}</Callout>;
  return (
    <OwnProfile
      profile={own}
      position={own.primaryPosition ? pos(positionKey(own.primaryPosition)) : null}
      secondary={own.secondaryPosition ? pos(positionKey(own.secondaryPosition)) : null}
      country={own.country ? countryName(own.country, locale) : null}
      nationality={own.nationality ? countryName(own.nationality, locale) : null}
    />
  );
}
