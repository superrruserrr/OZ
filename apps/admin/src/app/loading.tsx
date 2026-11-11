import { SportLoader } from '@oz/ui';
import { useTranslations } from 'next-intl';

/** Chargement d'un écran (lot 1.5bb, refonte 1.5da) : balle qui rebondit, annoncée une fois. */
export default function Loading() {
  const t = useTranslations('loading');
  return (
    <main className="mx-auto w-full max-w-5xl px-5">
      <SportLoader label={t('label')} />
    </main>
  );
}
