import 'server-only';
import type { SignupStatusOutput } from '@oz/contracts';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import type { ReactElement } from 'react';
import { Link, redirect } from '../i18n/navigation';
import { LOGIN_PATH, localized } from '../session/protected-routes';
import { readSignup } from './signup-api';
import { ONBOARDING_PATH } from './steps';

/** Panne de l'API : rien n'est perdu, l'écran propose de réessayer. */
async function Unavailable({ path }: { readonly path: string }) {
  const t = await getTranslations({
    locale: await rootLocale(),
    namespace: 'onboarding.unavailable',
  });
  return (
    <section className="flex flex-col gap-6" data-testid="onboarding-unavailable">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('lead')}</p>
      <Link href={path} className="inline-flex min-h-11 items-center underline">
        {t('retry')}
      </Link>
    </section>
  );
}

/** Compte refusé par l'API : message définitif, sans « réessayer ». */
async function Refused() {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'onboarding' });
  return (
    <section className="flex flex-col gap-6" data-testid="onboarding-refused">
      <h1 className="font-display text-3xl font-bold">{t('refusedTitle')}</h1>
      <p className="text-oz-text-muted">{t('errors.refused')}</p>
    </section>
  );
}

/** Connexion, retour à `path` dans la langue de l'écran. */
export function toLogin(path: string, locale: string): never {
  return redirect({
    href: { pathname: LOGIN_PATH, query: { next: localized(locale, path) } },
    locale,
  });
}

/**
 * Brouillon d'un écran du parcours, relu sur l'API à chaque rendu (ADR-010) : session refusée →
 * connexion ; inscription déjà finalisée → `/onboarding` ; panne → écran de reprise.
 */
export async function loadDraft(path: string): Promise<SignupStatusOutput | ReactElement> {
  const read = await readSignup();
  const locale = await rootLocale();
  switch (read.kind) {
    case 'draft':
      return read.status;
    case 'unauthenticated':
      return toLogin(path, locale);
    case 'completed':
      return redirect({ href: ONBOARDING_PATH, locale });
    case 'refused':
      return <Refused />;
    case 'unavailable':
      return <Unavailable path={path} />;
  }
}

export { Refused, Unavailable };

/** Fin de conservation du brouillon, dans la langue de l'écran. */
export function formatResume(expiresAt: string | null, locale: string): string | null {
  if (expiresAt === null) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(expiresAt),
  );
}
