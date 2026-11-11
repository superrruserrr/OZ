import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Briques de statistiques du thème « Workspace » (lot 1.5cc, ADR-012) : mini-courbe, anneau de
 * répartition, terrain des postes et tuile chiffrée. Composants serveur en SVG, sans attribut `style`
 * (CSP) : les tracés passent par des attributs SVG, les couleurs par des classes de jetons. Toute
 * valeur reste lisible en texte ; aucune note ni aucun score de joueur (Q18).
 */

/** Ordre des séries (ADR-012) : lime, bleu, ambre, puis gris ; les clartés diffèrent aussi. */
export const SERIES_TONES = ['primary', 'highlight', 'kyc', 'muted'] as const;
export type SeriesTone = (typeof SERIES_TONES)[number];

const FILL: Record<SeriesTone, string> = {
  primary: 'fill-oz-primary',
  highlight: 'fill-oz-highlight',
  kyc: 'fill-oz-kyc',
  muted: 'fill-oz-text-disabled',
};
const STROKE: Record<SeriesTone, string> = {
  primary: 'stroke-oz-primary',
  highlight: 'stroke-oz-highlight',
  kyc: 'stroke-oz-kyc',
  muted: 'stroke-oz-text-disabled',
};
const DOT: Record<SeriesTone, string> = {
  primary: 'bg-oz-primary',
  highlight: 'bg-oz-highlight',
  kyc: 'bg-oz-kyc',
  muted: 'bg-oz-text-disabled',
};

const round = (n: number) => Math.round(n * 100) / 100;
const finite = (values: readonly number[]) => values.filter((v) => Number.isFinite(v));

/** Points d'une série normalisée dans une boîte `width` × `height` (axe vertical inversé). */
export function sparklinePoints(values: readonly number[], width: number, height: number) {
  const data = finite(values);
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  return data.map(
    (v, i) => [round(i * step), round(height - ((v - min) / span) * height)] as const,
  );
}

export interface SparklineProps {
  values: readonly number[];
  tone?: SeriesTone | undefined;
  /** `area` : aire pleine (tuiles) ; `line` : trait seul. */
  variant?: 'area' | 'line' | undefined;
  className?: string | undefined;
}

/** Mini-courbe décorative : la valeur et sa variation sont dites en texte à côté. */
export function Sparkline({
  values,
  tone = 'primary',
  variant = 'area',
  className,
}: SparklineProps) {
  const w = 80;
  const h = 24;
  const points = sparklinePoints(values, w, h);
  if (points.length < 2) return null;
  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`)
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      data-testid="sparkline"
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      preserveAspectRatio="none"
      className={cn('h-6 w-20 overflow-visible', className)}
    >
      {variant === 'area' ? (
        <path d={`${line} L${String(w)} ${String(h)} L0 ${String(h)} Z`} className={FILL[tone]} />
      ) : (
        <path d={line} fill="none" strokeWidth="2" className={STROKE[tone]} />
      )}
    </svg>
  );
}

export interface StatTileProps {
  /** Libellé déjà traduit (« Vues recruteurs »). */
  label: string;
  /** Valeur déjà formatée par l'appelant ; jamais inventée (M5). */
  value: ReactNode;
  /** Variation déjà formulée (« +8 cette saison »). */
  delta?: ReactNode | undefined;
  trend?: readonly number[] | undefined;
  tone?: SeriesTone | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

/** Tuile chiffrée des tableaux de bord : libellé, grand chiffre, variation, mini-courbe. */
export function StatTile({
  label,
  value,
  delta,
  trend,
  tone = 'primary',
  testId = 'stat-tile',
  className,
}: StatTileProps) {
  return (
    <article
      data-testid={testId}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-oz-border bg-oz-surface-1 p-5',
        className,
      )}
    >
      <h3 className="text-sm text-oz-text-muted">{label}</h3>
      <p className="font-display text-3xl font-medium tracking-[-0.01em] text-oz-text tabular-nums">
        {value}
      </p>
      {delta || trend ? (
        <div className="flex items-end justify-between gap-3">
          {delta ? (
            <p className="text-xs font-medium text-oz-primary">
              <span aria-hidden="true">↗ </span>
              {delta}
            </p>
          ) : (
            <span />
          )}
          {trend ? <Sparkline values={trend} tone={tone} /> : null}
        </div>
      ) : null}
    </article>
  );
}

export interface RingSegment {
  /** Libellé déjà traduit (« Équipe A »). */
  label: string;
  value: number;
}

export interface RingChartProps {
  segments: readonly RingSegment[];
  /** Phrase lue par les lecteurs d'écran (« Répartition de l'effectif par équipe »). */
  label: string;
  /** Total affiché au centre, déjà formaté ; somme des segments par défaut. */
  total?: ReactNode | undefined;
  totalLabel?: string | undefined;
  className?: string | undefined;
}

const CIRCUMFERENCE = 100;
const RADIUS = CIRCUMFERENCE / (2 * Math.PI);

/** Anneau de répartition : l'anneau illustre, la légende donne chaque valeur en texte. */
export function RingChart({ segments, label, total, totalLabel, className }: RingChartProps) {
  const data = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const sum = data.reduce((acc, s) => acc + s.value, 0);
  let offset = 0;
  const arcs = data.map((segment, i) => {
    const length = sum > 0 ? (segment.value / sum) * CIRCUMFERENCE : 0;
    const arc = {
      segment,
      tone: SERIES_TONES[Math.min(i, SERIES_TONES.length - 1)] ?? 'muted',
      length,
      offset,
    };
    offset += length;
    return arc;
  });
  return (
    <figure data-testid="ring-chart" className={cn('flex flex-wrap items-center gap-6', className)}>
      <div className="relative size-36 shrink-0">
        <svg role="img" aria-label={label} viewBox="0 0 42 42" className="size-36 -rotate-90">
          <circle
            cx="21"
            cy="21"
            r={round(RADIUS)}
            fill="none"
            strokeWidth="5"
            className="stroke-oz-surface-2"
          />
          {arcs.map(({ segment, tone, length, offset: start }) => (
            <circle
              key={segment.label}
              cx="21"
              cy="21"
              r={round(RADIUS)}
              fill="none"
              strokeWidth="5"
              strokeDasharray={`${String(round(length))} ${String(round(CIRCUMFERENCE - length))}`}
              strokeDashoffset={String(round(-start))}
              className={STROKE[tone]}
            />
          ))}
        </svg>
        <p
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span className="font-display text-2xl font-medium text-oz-text tabular-nums">
            {total ?? sum}
          </span>
          {totalLabel ? <span className="text-xs text-oz-text-label">{totalLabel}</span> : null}
        </p>
      </div>
      <figcaption className="min-w-0 flex-1">
        <ul className="flex flex-col gap-2 text-sm">
          {arcs.map(({ segment, tone }) => (
            <li key={segment.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-oz-text-muted">
                <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[tone])} />
                {segment.label}
              </span>
              <span className="font-medium text-oz-text tabular-nums">{segment.value}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** Postes du terrain, coordonnées dans un terrain de 105 × 68 (attaque vers la droite). */
export const PITCH_SPOTS = Object.freeze({
  GK: [6, 34],
  CB: [22, 34],
  LB: [26, 10],
  RB: [26, 58],
  DM: [40, 34],
  CM: [52, 34],
  LM: [54, 12],
  RM: [54, 56],
  AM: [66, 34],
  LW: [80, 12],
  RW: [80, 56],
  ST: [90, 34],
} as const);
export type PitchSpot = keyof typeof PITCH_SPOTS;

export interface PitchPositionsProps {
  primary: PitchSpot;
  secondary?: readonly PitchSpot[] | undefined;
  /** Libellés déjà traduits, dans l'ordre : poste principal puis postes secondaires. */
  labels: { primary: string; secondary?: readonly string[] | undefined };
  /** Titre lu par les lecteurs d'écran (« Postes occupés »). */
  title: string;
  className?: string | undefined;
}

/** Terrain des postes occupés : le schéma illustre, la liste dit les postes en texte. */
export function PitchPositions({
  primary,
  secondary = [],
  labels,
  title,
  className,
}: PitchPositionsProps) {
  const [px, py] = PITCH_SPOTS[primary];
  return (
    <figure
      data-testid="pitch-positions"
      className={cn('flex flex-wrap items-center gap-4', className)}
    >
      <svg aria-hidden="true" viewBox="0 0 105 68" className="h-auto w-48 shrink-0">
        <g fill="none" strokeWidth="0.6" className="stroke-oz-border">
          <rect x="0.5" y="0.5" width="104" height="67" rx="2" />
          <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
          <circle cx="52.5" cy="34" r="9.15" />
          <rect x="0.5" y="13.85" width="16.5" height="40.3" />
          <rect x="88" y="13.85" width="16.5" height="40.3" />
        </g>
        {secondary.map((spot) => {
          const [x, y] = PITCH_SPOTS[spot];
          return <circle key={spot} cx={x} cy={y} r="3" className="fill-oz-highlight" />;
        })}
        <circle cx={px} cy={py} r="4.2" className="fill-oz-primary" />
      </svg>
      <figcaption className="min-w-0 flex-1">
        <p className="mb-2 text-xs font-medium tracking-[0.08em] text-oz-text-label uppercase">
          {title}
        </p>
        <ul className="flex flex-col gap-1 text-sm text-oz-text">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-oz-primary" />
            {labels.primary}
          </li>
          {(labels.secondary ?? []).map((name) => (
            <li key={name} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 rounded-full bg-oz-highlight" />
              {name}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
