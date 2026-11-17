import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { ForgotForm } from '../../../../../auth/forgot-form';

export const generateMetadata = () => authMetadata('forgot');

/** Mot de passe oublié (lot 1.7cc) : demande d'un lien par email, réponse toujours identique. */
export default async function ForgotPasswordPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.forgot' });
  const k = await getTranslations({ locale, namespace: 'auth.kickers' });
  return (
    <section className="flex flex-col gap-6">
      <AuthHeading kicker={k('security')} title={t('title')} lead={t('lead')} />
      <ForgotForm />
    </section>
  );
}
