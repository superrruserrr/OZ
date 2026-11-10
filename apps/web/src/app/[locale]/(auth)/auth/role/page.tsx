import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { RoleChooser } from '../../../../../auth/role-chooser';

export const generateMetadata = () => authMetadata('role');

/** Écran 02 : choix du type de compte (lot 1.7ca). */
export default async function RolePage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.role' });
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="mt-3 text-oz-text-muted">{t('lead')}</p>
      </div>
      <RoleChooser />
    </section>
  );
}
