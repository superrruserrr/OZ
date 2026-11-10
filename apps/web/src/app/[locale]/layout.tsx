import { ozThemes } from '@oz/ui/tokens';
import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { routing } from '../../i18n/routing';
import { fontVariables } from '../fonts';
import '../globals.css';

// Barre du navigateur aux couleurs du fond, clair ou sombre selon l'appareil (ADR-009).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: ozThemes.light.bg },
    { media: '(prefers-color-scheme: dark)', color: ozThemes.dark.bg },
  ],
  colorScheme: 'light dark',
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({ children }: { children: ReactNode }) {
  // Rendu à chaque requête : le nonce CSP ne peut pas figurer dans une page pré-rendue.
  await connection();
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={fontVariables}>
      <body className="bg-oz-bg text-oz-text">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
