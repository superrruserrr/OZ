import { SportLoader } from '@oz/ui';
import { useTranslations } from 'next-intl';

/**
 * Chargement d'un écran (lot 1.5bb, refonte 1.5da) : balle qui rebondit sur la ligne de terrain,
 * annoncée une fois (`role="status"`). Réservé aux écrans connectés : chaque segment l'exporte comme
 * `loading.tsx`. Pas au niveau `[locale]` : la réponse serait alors toujours diffusée en flux, et une
 * page publique inconnue renverrait 200 au lieu de 404 (lot 1.6).
 */
export function PageLoading() {
  const t = useTranslations('loading');
  return (
    <main className="mx-auto w-full max-w-5xl px-5">
      <SportLoader label={t('label')} />
    </main>
  );
}
