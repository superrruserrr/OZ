import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { VerifyEmail } from '../../../../../auth/verify-email';

export const generateMetadata = () => authMetadata('verify');

/** Lien reçu par email (`#token=…`, gabarit de l'API) : confirmation par action serveur. */
export default async function VerifyEmailPage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.verify' });
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <VerifyEmail />
    </section>
  );
}
