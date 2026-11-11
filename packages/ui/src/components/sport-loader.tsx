import { cn } from '../lib/cn.js';
import { SportGlyph, type Sport } from './sport-icon.js';

export interface SportLoaderProps {
  /** Message lu par les lecteurs d'écran et affiché sous l'animation (« Chargement… »). */
  label: string;
  /** Balle du sport qui rebondit ; football par défaut. */
  sport?: Sport | undefined;
  /** `page` : plein écran centré ; `inline` : dans une carte ou un panneau. */
  variant?: 'page' | 'inline' | undefined;
  className?: string | undefined;
}

/*
 * Chargement « sport » (lot 1.5da) : une balle rebondit sur la ligne de terrain, s'écrase à
 * l'impact, son ombre respire. Animation en transform et opacité (GPU), sans Lottie ni script ;
 * sous `prefers-reduced-motion`, la balle reste posée et seul le texte informe.
 */
export function SportLoader({
  label,
  sport = 'football',
  variant = 'page',
  className,
}: SportLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-sport={sport}
      data-testid="sport-loader"
      className={cn(
        'flex flex-col items-center justify-center gap-4 text-oz-text-muted',
        variant === 'page' ? 'min-h-[60dvh]' : 'py-8',
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 120 96" className="h-24 w-30 overflow-visible">
        {/* Ligne de terrain et rond central en pointillés qui défilent. */}
        <g className="stroke-oz-border" fill="none" strokeWidth="1.5">
          <path d="M4 84h112" />
          <path
            d="M30 84a30 10 0 0 0 60 0"
            strokeDasharray="3 5"
            className="motion-safe:animate-oz-dash"
          />
        </g>
        {/* Ombre : s'élargit quand la balle touche le sol. */}
        <ellipse
          cx="60"
          cy="85"
          rx="12"
          ry="2.5"
          className="origin-[60px_85px] fill-oz-primary/25 motion-safe:animate-oz-ball-shadow"
        />
        <g className="origin-[60px_84px] motion-safe:animate-oz-ball-bounce">
          <g transform="translate(46 56) scale(1.1667)" className="text-oz-primary">
            <SportGlyph
              sport={sport}
              className="origin-[12px_12px] motion-safe:animate-oz-ball-spin"
            />
          </g>
        </g>
      </svg>
      <p aria-hidden="true" className="text-sm">
        {label}
      </p>
    </div>
  );
}
