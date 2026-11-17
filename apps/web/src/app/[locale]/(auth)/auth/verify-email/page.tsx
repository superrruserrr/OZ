import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { VerifyEmail } from '../../../../../auth/verify-email';
import { GUARDIAN_INVITE_COOKIE } from '../../../../../session/cookies';
import {
  DEFAULT_AFTER_LOGIN,
  GUARDIAN_INVITATION_PATH,
} from '../../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('verify');

/** Lien reçu par email (`#token=…`, gabarit de l'API) : confirmation par action serveur. */
export default async function VerifyEmailPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.verify' });
  const k = await getTranslations({ locale, namespace: 'auth.kickers' });
  // Invitation de tuteur en attente sur cet appareil (B4) : la connexion y ramène.
  const next = (await cookies()).has(GUARDIAN_INVITE_COOKIE)
    ? GUARDIAN_INVITATION_PATH
    : DEFAULT_AFTER_LOGIN;
  return (
    <section className="flex flex-col gap-6">
      <AuthHeading kicker={k('signup')} title={t('title')} />
      <VerifyEmail next={next} />
    </section>
  );
}
