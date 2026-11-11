import { OZ_DEFAULT_MODE, ozThemes } from '@oz/ui/tokens';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { ADMIN_LOCALE } from '../i18n/request';
import { fontVariables } from './fonts';
import './globals.css';

// Barre du navigateur aux couleurs du fond : thème sombre unique (ADR-011).
export const viewport: Viewport = {
  themeColor: ozThemes[OZ_DEFAULT_MODE].bg,
  colorScheme: 'dark',
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
