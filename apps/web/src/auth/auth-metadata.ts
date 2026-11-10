import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';

/** Écrans de compte : titre traduit, jamais indexés (robots). */
export async function authMetadata(
  key: 'role' | 'signup' | 'login' | 'verify' | 'onboarding',
): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  return { title: t(key), robots: { index: false, follow: false } };
}
