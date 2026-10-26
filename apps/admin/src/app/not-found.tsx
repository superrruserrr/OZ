import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('title') };
}

/** 404 du back-office, en français comme le reste (EX-T21.3), rendue dans le layout racine. */
export default function NotFoundPage() {
  const t = useTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('body')}</p>
      <Link
        href="/"
        className="inline-flex min-h-11 w-fit items-center text-oz-primary underline underline-offset-4"
        data-testid="not-found-home-link"
      >
        {t('back')}
      </Link>
    </main>
  );
}
