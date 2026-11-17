import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { RoleChooser } from '../../../../../auth/role-chooser';

export const generateMetadata = () => authMetadata('role');

/** Écran 02 : choix du type de compte (lot 1.7ca, refonte 1.5cbb). */
export default async function RolePage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.role' });
  const k = await getTranslations({ locale, namespace: 'auth.kickers' });
  return (
    <section className="flex flex-col gap-6">
      <AuthHeading kicker={k('signup')} title={t('title')} lead={t('lead')} />
      <RoleChooser />
    </section>
  );
}
