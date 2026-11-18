import { Skeleton, SportLoader } from '@oz/ui';
import { useTranslations } from 'next-intl';

/*
 * Chargement d'un écran (lot 1.5bb, refonte 1.5e) : trois balles sortent de l'anneau OZ au-dessus
 * d'un squelette de la page, annoncé une seule fois (`role="status"`). Rien n'apparaît avant 150 ms
 * et rien ne couvre l'écran : la page arrive à sa place, sans saut. Réservé aux écrans connectés :
 * chaque segment l'exporte comme `loading.tsx`. Pas au niveau `[locale]` : la réponse serait alors
 * toujours diffusée en flux, et une page publique inconnue renverrait 200 au lieu de 404 (lot 1.6).
 */
export function PageLoading({ inShell = false }: { inShell?: boolean }) {
  const t = useTranslations('loading');
  const content = (
    <>
      <SportLoader label={t('label')} />
      <div
        aria-hidden="true"
        data-testid="page-skeleton"
        className="flex animate-oz-loader-appear flex-col gap-4"
      >
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28 max-lg:hidden" />
        </div>
      </div>
    </>
  );
  if (inShell) return <div className="flex flex-col gap-2">{content}</div>;
  return <main className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5">{content}</main>;
}
