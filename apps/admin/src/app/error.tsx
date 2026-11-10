'use client';

import { Button } from '@oz/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

/*
 * Erreur d'un écran (lot 1.5bb) : message simple, jamais le détail technique ni l'identifiant
 * (`digest`), qui restent dans les journaux du serveur. « Réessayer » relance le rendu du segment.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');
  return (
    <main
      id="contenu"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-start justify-center gap-4 px-5"
    >
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('body')}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button data-testid="error-retry" onClick={reset}>
          {t('retry')}
        </Button>
        <Link
          href="/"
          data-testid="error-home-link"
          className="inline-flex min-h-11 items-center text-oz-primary underline underline-offset-4"
        >
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
