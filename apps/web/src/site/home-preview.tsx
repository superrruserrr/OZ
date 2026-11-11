import { Badge, ClubCrest, PitchPositions, Sparkline, SportTag } from '@oz/ui';
import { useTranslations } from 'next-intl';

/** Silhouette illustrée : jamais la photo d'une personne réelle pour un profil fictif. */
function Silhouette() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="size-16 shrink-0 rounded-2xl bg-oz-surface-2 text-oz-text-disabled"
    >
      <circle cx="32" cy="24" r="11" fill="currentColor" />
      <path d="M10 62c2-14 11-21 22-21s20 7 22 21z" fill="currentColor" />
    </svg>
  );
}

/**
 * Aperçu d'une fiche joueur (lot 1.5db) : profil fictif annoncé comme exemple, sans chiffre ni note
 * (M5, Q18). Le sport, le club (écusson générique) et la vérification se lisent d'un coup d'œil ; la
 * courbe est décorative.
 */
export function HomePreview() {
  const t = useTranslations('home.preview');
  return (
    <figure
      data-testid="home-preview"
      className="relative rounded-3xl border border-oz-border bg-oz-surface-1 p-5 shadow-[0_0_60px_-30px_var(--oz-primary)] sm:p-6"
    >
      <span className="absolute top-4 right-4 rounded-md border border-oz-border px-2 py-1 text-[11px] font-medium tracking-[0.08em] text-oz-text-label uppercase">
        {t('example')}
      </span>
      <div className="flex items-center gap-4">
        <Silhouette />
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-medium text-oz-text">{t('name')}</p>
          <p className="mt-1 text-sm text-oz-text-muted">{t('position')}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SportTag sport="football" label={t('sport')} />
        <Badge tone="verified" filled>
          {t('verified')}
        </Badge>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-oz-border bg-oz-surface-2 p-3">
        <ClubCrest name={t('club')} decorative className="h-9" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium text-oz-text">{t('club')}</p>
          <p className="text-oz-text-muted">{t('country')}</p>
        </div>
      </div>
      <PitchPositions
        className="mt-5"
        title={t('positions')}
        primary="CB"
        secondary={['RB']}
        labels={{ primary: t('position'), secondary: [t('secondary')] }}
      />
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-oz-border pt-4">
        <dl className="text-sm">
          <dt className="text-oz-text-label">{t('foot')}</dt>
          <dd className="font-medium text-oz-text">{t('footValue')}</dd>
        </dl>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-oz-text-label">{t('activity')}</span>
          <Sparkline values={[2, 3, 3, 5, 4, 6, 7]} />
        </div>
      </div>
      <figcaption className="mt-4 text-xs text-oz-text-label">{t('exampleNote')}</figcaption>
    </figure>
  );
}
