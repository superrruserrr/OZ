import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { Link } from '../i18n/navigation';
import { fontVariables } from './fonts';
import './globals.css';

/*
 * Page 404 de tout le site, rendue côté serveur. Le layout racine étant le segment dynamique
 * `[locale]`, un not-found.tsx de segment n'était rendu que dans le navigateur (page blanche sans JS).
 * La langue vient de l'en-tête posé par next-intl dans src/proxy.ts (voir i18n/request.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('title') };
}

export default async function GlobalNotFound() {
  // Rendu à chaque requête : le nonce CSP ne peut pas figurer dans une page pré-rendue.
  await connection();
  const [locale, t] = await Promise.all([getLocale(), getTranslations('notFound')]);
  return (
    <html lang={locale} className={fontVariables}>
      <body className="bg-oz-bg text-oz-text">
        {/* Hors du layout [locale] : le lien localisé (composant client) a besoin du fournisseur. */}
        <NextIntlClientProvider>
          <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-5">
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-oz-text-muted">{t('body')}</p>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-oz-primary underline underline-offset-4"
              data-testid="not-found-home-link"
            >
              {t('back')}
            </Link>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
