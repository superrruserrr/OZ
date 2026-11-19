import { cn } from '../lib/cn.js';

export interface RadarAxis {
  key: string;
  /** Libellé déjà traduit (« Identité »). */
  label: string;
  /** Valeur réelle entre 0 et `max`, ou `null` quand la donnée n'existe pas encore. */
  value: number | null;
  /** Texte de valeur déjà formaté (« 75 % ») ; la valeur brute par défaut. */
  valueText?: string | undefined;
}

export interface AttributeRadarProps {
  /** Nom du graphique, lu par les lecteurs d'écran (« Complétude du profil »). */
  label: string;
  /** Trois à huit axes ; six pour l'hexagone. */
  axes: readonly RadarAxis[];
  max?: number | undefined;
  /** Texte affiché quand aucun axe n'a de donnée (« En attente de mesures certifiées »). */
  emptyText?: string | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

const CENTER = 100;
const RADIUS = 72;
const RINGS = [0.25, 0.5, 0.75, 1] as const;

const round = (n: number) => Math.round(n * 100) / 100;

/** Sommet de l'axe `index` sur `count`, à la fraction `ratio` du rayon (bornée à 0..1), premier axe en haut. */
export function radarPoint(index: number, count: number, ratio: number): [number, number] {
  const r = RADIUS * Math.min(1, Math.max(0, ratio));
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  return [round(CENTER + r * Math.cos(angle)), round(CENTER + r * Math.sin(angle))];
}

const polygon = (count: number, ratio: (index: number) => number) =>
  Array.from({ length: count }, (_, index) =>
    radarPoint(index, count, ratio(index)).join(','),
  ).join(' ');

/*
 * Hexagone des données façon jeu de football (lot 1.5eb, E4). Il ne dessine que des valeurs réelles :
 * un axe sans donnée vaut `null` et s'affiche « — » ; sans aucune donnée, la grille reste vide avec
 * `emptyText`, jamais de forme d'exemple. Ce n'est ni une note ni un score (Q18) : la légende donne
 * chaque valeur en texte, le dessin n'est qu'une illustration. SVG sans attribut `style` (CSP).
 */
export function AttributeRadar({
  label,
  axes,
  max = 100,
  emptyText,
  testId = 'attribute-radar',
  className,
}: AttributeRadarProps) {
  const count = axes.length;
  if (count < 3 || count > 8) return null;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const ratios = axes.map((axis) =>
    axis.value === null || !Number.isFinite(axis.value) ? null : axis.value / safeMax,
  );
  const empty = ratios.every((ratio) => ratio === null);
  return (
    <figure
      aria-label={label}
      data-testid={testId}
      data-state={empty ? 'empty' : 'filled'}
      className={cn('flex flex-col items-center gap-3', className)}
    >
      <svg aria-hidden="true" viewBox="0 0 200 200" className="w-full max-w-60 overflow-visible">
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(count, () => ring)}
            fill="none"
            strokeWidth={ring === 1 ? 1.5 : 1}
            strokeDasharray={empty && ring === 1 ? '4 4' : undefined}
            className={ring === 1 ? 'stroke-oz-primary/40' : 'stroke-oz-border'}
          />
        ))}
        {axes.map((axis, index) => {
          const [x, y] = radarPoint(index, count, 1);
          return (
            <line
              key={axis.key}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              strokeWidth="1"
              className="stroke-oz-border"
            />
          );
        })}
        {empty ? null : (
          <g className="origin-[100px_100px] motion-safe:animate-oz-radar-in">
            <polygon
              data-part="values"
              points={polygon(count, (index) => ratios[index] ?? 0)}
              strokeWidth="2"
              strokeLinejoin="round"
              className="fill-oz-primary/20 stroke-oz-primary"
            />
            {axes.map((axis, index) => {
              const ratio = ratios[index];
              if (ratio === null || ratio === undefined) return null;
              const [x, y] = radarPoint(index, count, ratio);
              return <circle key={axis.key} cx={x} cy={y} r="3" className="fill-oz-primary" />;
            })}
          </g>
        )}
      </svg>
      {empty && emptyText ? <p className="text-sm text-oz-text-muted">{emptyText}</p> : null}
      <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-1 text-sm min-[400px]:grid-cols-2">
        {axes.map((axis, index) => (
          <li key={axis.key} className="flex items-baseline justify-between gap-2">
            <span className="text-oz-text-muted">{axis.label}</span>
            <span className="font-medium text-oz-text tabular-nums">
              {ratios[index] === null ? '—' : (axis.valueText ?? String(axis.value))}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
