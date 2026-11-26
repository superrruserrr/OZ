import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../../auth/auth-metadata';
import { loadOwn } from '../../../../../../espace/load-own';
import { isMinor } from '../../../../../../guardian/minor';
import { ProfileForm } from '../../../../../../espace/profile-form';
import { countryOptions } from '../../../../../../onboarding/countries';

export const generateMetadata = () => authMetadata('dashboard');

/** Modifier mon profil (lot 1.19cb) : la fiche relue sur l'API, champs préremplis. */
export default async function EditProfilePage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'espace' });
  const own = await loadOwn('/espace/profil/modifier', locale);
  if (own === null) {
    return <Callout testId="own-profile-unavailable">{t('home.unavailable')}</Callout>;
  }
  // Mineur : sa fiche est modifiée par son tuteur vérifié (`profile.update`, cellule `child`).
  const minor = own.birthDate !== undefined && isMinor(own.birthDate);
  return (
    <div className="flex flex-col gap-6" data-testid="espace-profile-edit">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium text-oz-text">{t('edit.title')}</h1>
        <p className="text-oz-text-muted">{t('edit.lead')}</p>
      </header>
      {minor ? (
        <Callout tone="legal" testId="espace-profile-minor">
          {t('edit.minor')}
        </Callout>
      ) : (
        <ProfileForm profile={own} countries={countryOptions(locale)} />
      )}
    </div>
  );
}
