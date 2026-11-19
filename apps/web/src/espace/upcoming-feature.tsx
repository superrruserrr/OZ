import { AttributeRadar, Badge } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation';

export type UpcomingFeatureId = 'performances' | 'videos' | 'messages';

const APTITUDES = ['speed', 'endurance', 'jump', 'agility', 'strength', 'technique'] as const;
const POINTS = ['one', 'two', 'three'] as const;

/** Illustration décorative de chaque page à venir : formes au trait, sans visage (EX-T16). */
function Art({ feature }: { readonly feature: UpcomingFeatureId }) {
  return (
    <svg
      viewBox="0 0 240 140"
      aria-hidden="true"
      className="h-36 w-full max-w-xs text-oz-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 130 C80 110 160 110 230 130" className="stroke-oz-primary/30" />
      {feature === 'videos' ? (
        <>
          <rect x="50" y="24" width="140" height="84" rx="12" className="fill-oz-primary/10" />
          <path d="M108 50v32l26-16z" className="fill-oz-primary" />
        </>
      ) : feature === 'messages' ? (
        <>
          <path d="M40 30h110v60H78l-24 18V90H40z" className="fill-oz-primary/10" />
          <path d="M120 54h80v48h-14v14l-18-14h-48z" className="stroke-oz-primary/60" />
          <path d="M60 52h70M60 68h46" />
        </>
      ) : (
        <>
          <circle cx="120" cy="66" r="44" className="fill-oz-primary/10" />
          <path d="M120 66 L120 30 M120 66 L150 84" />
          <path d="M84 104l8-8M156 104l-8-8M120 22v8" className="stroke-oz-primary/60" />
        </>
      )}
    </svg>
  );
}

/**
 * Page d'une fonction pas encore livrée (maquette v2) : l'entrée du rail mène à une vraie page qui
 * explique ce qui arrive, sans chiffre inventé (Q18) ni lien mort ; retour vers l'accueil.
 */
export function UpcomingFeature({ feature }: { readonly feature: UpcomingFeatureId }) {
  const t = useTranslations(`espace.upcoming.${feature}`);
  const common = useTranslations('espace.upcoming');
  const axes = useTranslations('dashboard.aptitudes.axes');
  return (
    <section className="flex flex-col gap-6" data-testid={`upcoming-${feature}`}>
      <header className="flex flex-col gap-3">
        <div>
          <Badge tone="neutral" filled>
            {common('badge')}
          </Badge>
        </div>
        <h1 className="text-2xl font-medium text-oz-text sm:text-3xl">{t('title')}</h1>
        <p className="text-oz-text-muted">{t('lead')}</p>
      </header>
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-oz-border bg-oz-surface-1 p-6 text-center sm:p-8">
        {feature === 'performances' ? (
          <AttributeRadar
            label={common('aptitudes')}
            emptyText={t('empty')}
            axes={APTITUDES.map((key) => ({ key, label: axes(key), value: null }))}
          />
        ) : (
          <>
            <Art feature={feature} />
            <p className="max-w-md text-sm text-oz-text-muted">{t('empty')}</p>
          </>
        )}
      </div>
      <section aria-label={common('next')} className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-oz-text">{common('next')}</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {POINTS.map((point) => (
            <li
              key={point}
              className="rounded-2xl border border-oz-border bg-oz-surface-1 p-4 text-sm text-oz-text-muted"
            >
              {t(`points.${point}`)}
            </li>
          ))}
        </ul>
      </section>
      <Link
        href="/espace"
        className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-oz-primary underline-offset-4 hover:underline"
      >
        {common('back')}
      </Link>
    </section>
  );
}
