import { cn } from '../lib/cn.js';
import { SportGlyph, type Sport } from './sport-icon.js';

export type LoaderSports = readonly [Sport, Sport, Sport];

export interface SportLoaderProps {
  /** Message lu par les lecteurs d'écran et affiché sous l'animation (« Chargement… »). */
  label: string;
  /** Les trois balles qui sortent de l'anneau, de gauche à droite (univers multisport). */
  sports?: LoaderSports | undefined;
  /** `page` : en tête du contenu, sur un squelette ; `inline` : dans une carte ou un panneau. */
  variant?: 'page' | 'inline' | undefined;
  className?: string | undefined;
}

const DEFAULT_SPORTS: LoaderSports = ['football', 'basketball', 'tennis'];

/* Positions finales (centre des balles), départ commun au centre de l'anneau. */
const BALLS = [
  { x: 24, split: 'motion-safe:animate-oz-split-left', hop: 'motion-safe:animate-oz-ball-hop-1' },
  { x: 60, split: 'motion-safe:animate-oz-split-center', hop: 'motion-safe:animate-oz-ball-hop-2' },
  { x: 96, split: 'motion-safe:animate-oz-split-right', hop: 'motion-safe:animate-oz-ball-hop-3' },
] as const;

/*
 * Chargement multisport (lot 1.5e, E5) : rien pendant 150 ms, si bien qu'une page rapide n'affiche
 * aucune animation ; ensuite l'anneau OZ (un cercle, pas le logo recomposé, ADR-009) éclate en trois
 * balles qui sautillent en décalé. SVG et CSS seulement (transform et opacité), aucun attribut
 * `style` (CSP). Sous `prefers-reduced-motion`, l'anneau reste fixe et seul le texte informe.
 */
export function SportLoader({
  label,
  sports = DEFAULT_SPORTS,
  variant = 'page',
  className,
}: SportLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-sports={sports.join(' ')}
      data-testid="sport-loader"
      className={cn(
        'flex animate-oz-loader-appear flex-col items-center justify-center gap-2 text-oz-text-muted',
        variant === 'page' ? 'py-6' : 'py-4',
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 120 64" className="h-16 w-30 overflow-visible">
        <path d="M8 56h104" className="stroke-oz-border" strokeWidth="1.5" fill="none" />
        <circle
          data-part="ring"
          cx="60"
          cy="36"
          r="14"
          fill="none"
          strokeWidth="4"
          className="origin-center stroke-oz-primary [transform-box:fill-box] motion-safe:animate-oz-ring-burst"
        />
        {BALLS.map((ball, index) => (
          <g key={ball.x} transform={`translate(${String(ball.x - 12)} 24)`}>
            <g
              data-ball={sports[index]}
              className={cn('origin-center opacity-0 [transform-box:fill-box]', ball.split)}
            >
              <g className={cn('text-oz-primary', ball.hop)}>
                <SportGlyph sport={sports[index] ?? 'football'} />
              </g>
            </g>
          </g>
        ))}
      </svg>
      <p aria-hidden="true" className="text-xs">
        {label}
      </p>
    </div>
  );
}
