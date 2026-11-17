import { cn } from '../lib/cn.js';

export interface GaugeDialProps {
  /** Nom de la jauge, déjà traduit (« Profil complété »). */
  label: string;
  /** Valeur réelle entre 0 et `max`, ou `null` tant qu'elle n'existe pas. */
  value: number | null;
  max?: number | undefined;
  /** Texte de valeur déjà formaté (« 60 % »). */
  valueText?: string | undefined;
  /** Texte sous la jauge vide (« Bientôt disponible »). */
  emptyText?: string | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

/* Demi-cercle de rayon 40 centré en (50, 50) ; `pathLength` à 100 pour un tracé en pourcentage. */
const ARC = 'M10 50a40 40 0 0 1 80 0';
const TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const tick = (index: number) => {
  const angle = Math.PI + (Math.PI * index) / 10;
  const point = (r: number) =>
    [50 + r * Math.cos(angle), 50 + r * Math.sin(angle)].map((n) => Math.round(n * 100) / 100);
  const [x1, y1] = point(46);
  const [x2, y2] = point(index % 5 === 0 ? 51 : 49);
  return { x1, y1, x2, y2 };
};

/*
 * Jauge en demi-cercle façon tableau de bord de jeu (lot 1.5eb). Une valeur réelle seulement : sans
 * valeur, la piste reste vide avec `emptyText` et rien n'est annoncé comme mesure. Arc tracé par
 * `stroke-dasharray` (attribut SVG, pas de `style`, CSP).
 */
export function GaugeDial({
  label,
  value,
  max = 100,
  valueText,
  emptyText,
  testId = 'gauge-dial',
  className,
}: GaugeDialProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const known = value !== null && Number.isFinite(value);
  const ratio = known ? Math.min(1, Math.max(0, value / safeMax)) : 0;
  const text = known ? (valueText ?? String(value)) : '—';
  const meter = known
    ? {
        role: 'meter' as const,
        'aria-valuenow': value,
        'aria-valuemin': 0,
        'aria-valuemax': safeMax,
        'aria-valuetext': text,
      }
    : {};
  return (
    <div
      {...meter}
      aria-label={label}
      data-testid={testId}
      data-state={known ? 'filled' : 'empty'}
      className={cn('flex flex-col items-center gap-1', className)}
    >
      <svg aria-hidden="true" viewBox="0 0 100 58" className="w-full max-w-40 overflow-visible">
        {TICKS.map((index) => (
          <line key={index} {...tick(index)} strokeWidth="1" className="stroke-oz-border" />
        ))}
        <path
          d={ARC}
          pathLength={100}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={known ? undefined : '2 3'}
          className="stroke-oz-surface-input"
        />
        {known ? (
          <path
            data-part="arc"
            d={ARC}
            pathLength={100}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${String(Math.round(ratio * 100))} 100`}
            className="stroke-oz-primary"
          />
        ) : null}
        <text
          x="50"
          y="48"
          textAnchor="middle"
          className={cn(
            'font-display text-[14px] font-medium tabular-nums',
            known ? 'fill-oz-text' : 'fill-oz-text-label',
          )}
        >
          {text}
        </text>
      </svg>
      <p className="text-sm text-oz-text-muted" aria-hidden={known ? 'true' : undefined}>
        {label}
      </p>
      {known ? null : emptyText ? <p className="text-xs text-oz-text-label">{emptyText}</p> : null}
    </div>
  );
}
