import { SportLoader } from '@oz/ui';
import { useTranslations } from 'next-intl';

/** Chargement de l'espace connecté (lot 1.5dc) : la coquille reste, la balle rebondit dans le contenu. */
export default function Loading() {
  const t = useTranslations('loading');
  return <SportLoader label={t('label')} />;
}
