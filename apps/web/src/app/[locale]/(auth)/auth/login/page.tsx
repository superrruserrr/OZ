import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { LoginForm } from '../../../../../auth/login-form';

export const generateMetadata = () => authMetadata('login');

/** Connexion (lot 1.7ca) ; `next` est revalidé par l'action serveur (pas de redirection ouverte). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'auth.login' });
  const raw = (await searchParams).next;
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <LoginForm next={typeof raw === 'string' ? raw : null} />
    </section>
  );
}
