import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { PitchCircles } from './emotion.js';

/**
 * Opacité de chaque faisceau de projecteur. Bornes testées : même superposés au même point, le texte
 * secondaire et les libellés restent AA (EX-T22). Les classes ci-dessous reprennent ces valeurs.
 */
export const STADIUM_GLOWS = Object.freeze({ primary: 0.08, highlight: 0.06, accent: 0.03 });

export interface StadiumHeroProps {
  /** Colonne de texte (libellé, titre, accroche, actions). */
  copy: ReactNode;
  /** Panneau latéral (≥ 1024 px) ; passe sous le texte en dessous. */
  aside?: ReactNode | undefined;
  /**
   * Photo de fond optionnelle (AVIF/WebP, `next/image` côté web), décorative : `alt=""`. Aucune
   * photo de joueur identifiable ni de mineur (EX-T16) ; en attente d'une photo libre (D-129).
   */
  media?: ReactNode | undefined;
  className?: string | undefined;
}

/*
 * Héros « nuit de stade » (lot 1.5ca, ADR-011) d'après la maquette Manus : plein écran, voile
 * sombre de gauche à droite, panneau vitré à droite. Sans photo, le décor est dessiné en CSS et SVG
 * (faisceaux de projecteurs, lignes du terrain, rond central E16) : aucun octet d'image, aucune
 * attente au chargement. Seuls `transform` et `opacity` bougent, et uniquement en `motion-safe`.
 */
export function StadiumHero({ copy, aside, media, className }: StadiumHeroProps) {
  return (
    <section
      data-testid="stadium-hero"
      className={cn('relative isolate overflow-hidden border-b border-oz-border', className)}
    >
      <div
        data-testid="stadium-hero-decor"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        {media ? (
          <div className="absolute inset-0 opacity-60 [&>img]:size-full [&>img]:object-cover">
            {media}
          </div>
        ) : null}
        {/* Voile sur la photo éventuelle : lisibilité (gauche) et raccord avec la page (bas). Les
            faisceaux passent au-dessus, bornés par STADIUM_GLOWS. */}
        <div className="absolute inset-0 bg-linear-to-r from-oz-bg via-oz-bg/70 to-oz-bg/10" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-oz-bg to-transparent" />
        {/* Projecteurs : un vert à gauche, un turquoise à droite, un rose diffus au centre. */}
        <div className="absolute -top-1/3 -left-1/4 h-[90%] w-[70%] origin-top-left -rotate-12 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--oz-primary)_8%,transparent),transparent_68%)] motion-safe:animate-oz-breathe" />
        <div className="absolute -top-1/3 -right-1/4 h-[90%] w-[70%] origin-top-right rotate-12 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--oz-highlight)_6%,transparent),transparent_68%)] motion-safe:animate-oz-breathe motion-safe:[animation-delay:-2s]" />
        <div className="absolute top-1/4 left-1/3 h-1/2 w-1/2 bg-[radial-gradient(circle,color-mix(in_srgb,var(--oz-accent)_3%,transparent),transparent_70%)]" />
        {/* Lignes du terrain en perspective, très discrètes. */}
        <svg
          viewBox="0 0 1200 400"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 hidden h-2/5 w-full text-oz-text opacity-[0.1] sm:block"
          fill="none"
        >
          <path d="M120 400 L420 40 H780 L1080 400" stroke="currentColor" strokeWidth="1.5" />
          <path d="M600 40 V400" stroke="currentColor" strokeWidth="1" />
          <path d="M270 220 H930" stroke="currentColor" strokeWidth="1" />
          <ellipse cx="600" cy="220" rx="150" ry="46" stroke="currentColor" strokeWidth="1" />
        </svg>
        <PitchCircles className="absolute right-[-9rem] bottom-[-9rem] size-[20rem] lg:top-1/2 lg:right-[-6rem] lg:bottom-auto lg:size-[42rem] lg:-translate-y-1/2" />
      </div>
      <div
        data-testid="stadium-hero-grid"
        className="mx-auto grid min-h-[min(78vh,46rem)] w-full max-w-6xl min-w-0 content-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center lg:gap-16 lg:py-24"
      >
        <div className="min-w-0 motion-safe:animate-oz-lift">{copy}</div>
        {aside ? (
          <div className="min-w-0 motion-safe:animate-oz-rise motion-safe:[animation-delay:120ms]">
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
