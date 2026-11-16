import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { ForgotForm } from '../../../../../auth/forgot-form';

export const generateMetadata = () => authMetadata('forgot');

/** Mot de passe oublié (lot 1.7cc) : demande d'un lien par email, réponse toujours identique. */
export default async function ForgotPasswordPage() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.forgot' });
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('lead')}</p>
      <ForgotForm />
    </section>
  );
}
