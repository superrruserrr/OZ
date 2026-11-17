import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { ResetForm } from '../../../../../auth/reset-form';

export const generateMetadata = () => authMetadata('reset');

/** Lien reçu par email (`#token=…`, gabarit de l'API) : choix d'un nouveau mot de passe. */
export default async function ResetPasswordPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.reset' });
  const k = await getTranslations({ locale, namespace: 'auth.kickers' });
  return (
    <section className="flex flex-col gap-6">
      <AuthHeading kicker={k('security')} title={t('title')} lead={t('lead')} />
      <ResetForm />
    </section>
  );
}
