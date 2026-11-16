import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { ResetForm } from '../../../../../auth/reset-form';

export const generateMetadata = () => authMetadata('reset');

/** Lien reçu par email (`#token=…`, gabarit de l'API) : choix d'un nouveau mot de passe. */
export default async function ResetPasswordPage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.reset' });
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('lead')}</p>
      <ResetForm />
    </section>
  );
}
