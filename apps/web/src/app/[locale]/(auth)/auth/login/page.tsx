import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { LoginForm } from '../../../../../auth/login-form';

export const generateMetadata = () => authMetadata('login');

/** Connexion (lot 1.7ca) ; `next` est revalidé par l'action serveur (pas de redirection ouverte). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.login' });
  const k = await getTranslations({ locale, namespace: 'auth.kickers' });
  const raw = (await searchParams).next;
  return (
    <section className="flex flex-col gap-6">
      <AuthHeading kicker={k('account')} title={t('title')} lead={t('lead')} />
      <LoginForm next={typeof raw === 'string' ? raw : null} />
    </section>
  );
}
