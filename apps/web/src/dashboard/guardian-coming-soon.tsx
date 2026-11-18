import { useTranslations } from 'next-intl';
import { ComingSoonGrid } from './coming-soon';
import { DASHBOARD_ICONS } from './icons';

const SOON = [
  { key: 'notifications', icon: DASHBOARD_ICONS.bell },
  { key: 'documents', icon: DASHBOARD_ICONS.file },
  { key: 'export', icon: DASHBOARD_ICONS.download },
  { key: 'messages', icon: DASHBOARD_ICONS.message },
] as const;

/** Espace du tuteur (lot 1.5ec, E2) : fonctions à venir, cartes désactivées remplies par 1.19c. */
export function GuardianComingSoon() {
  const t = useTranslations('dashboard');
  return (
    <ComingSoonGrid
      title={t('guardian.soonTitle')}
      badge={t('soonBadge')}
      items={SOON.map((item) => ({
        key: item.key,
        icon: item.icon,
        title: t(`guardian.soon.${item.key}.title`),
        text: t(`guardian.soon.${item.key}.text`),
      }))}
    />
  );
}
