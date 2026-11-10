import { ozThemes } from '@oz/ui/tokens';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { ADMIN_LOCALE } from '../i18n/request';
import { fontVariables } from './fonts';
import './globals.css';

// Barre du navigateur aux couleurs du fond, clair ou sombre selon l'appareil (ADR-009).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: ozThemes.light.bg },
    { media: '(prefers-color-scheme: dark)', color: ozThemes.dark.bg },
  ],
  colorScheme: 'light dark',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendu à chaque requête : le nonce CSP ne peut pas figurer dans une page pré-rendue.
  await connection();
  return (
    <html lang={ADMIN_LOCALE} className={fontVariables}>
      <body className="bg-oz-bg text-oz-text">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
