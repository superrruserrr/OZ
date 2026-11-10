import { Skeleton, SkeletonGroup } from '@oz/ui';
import { useTranslations } from 'next-intl';

/**
 * Chargement d'un écran (lot 1.5bb, E14) : squelettes plutôt qu'un spinner, annoncés une fois.
 * Réservé aux écrans connectés : chaque segment l'exporte comme `loading.tsx`. Pas au niveau
 * `[locale]` : la réponse serait alors toujours diffusée en flux, et une page publique inconnue
 * renverrait 200 au lieu de 404 (lot 1.6).
 */
export function PageLoading() {
  const t = useTranslations('loading');
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <SkeletonGroup label={t('label')} testId="page-loading">
        <Skeleton className="h-8 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-5/6 max-w-lg" />
        <Skeleton className="mt-6 h-32 w-full" />
      </SkeletonGroup>
    </main>
  );
}
