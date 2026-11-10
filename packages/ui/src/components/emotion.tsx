'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Effets du registre Émotion (lot 1.5bb, design.md §8.2 et §8.7) : site public, carte OZ ID,
 * marketing ; jamais dans un formulaire, le KYC ou le back-office. Transform et opacité seulement ;
 * chaque boucle est coupée avec mouvement réduit (`motion-safe:`). E17 (néon) et E22 (or) sont
 * retirés par la charte (ADR-009) ; E19 et E21 attendent leurs ressources (DEBT).
 */

export interface HaloProps {
  children: ReactNode;
  className?: string | undefined;
}

/** E1 : halo vert diffus derrière la carte OZ ID, seul dégradé décoratif du parcours. */
export function Halo({ children, className }: HaloProps) {
  return (
    <div className={cn('relative isolate overflow-hidden p-8', className)}>
      <span
        aria-hidden="true"
        data-testid="halo-glow"
        className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-radial from-oz-primary/15 to-transparent to-70% motion-safe:animate-oz-breathe"
      />
      {children}
    </div>
  );
}

const REVEAL_DELAY_MS = 500;
const CHAR_MS = 40;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface OzIdRevealProps {
  ozId: string;
  className?: string | undefined;
}

/*
 * E2 : l'OZ ID se tape caractère par caractère (40 ms) après la montée de la carte (500 ms). Le
 * rendu serveur et les lecteurs d'écran ont l'OZ ID complet dès le départ ; mouvement réduit :
 * affichage direct.
 */
export function OzIdReveal({ ozId, className }: OzIdRevealProps) {
  const [shown, setShown] = useState(ozId.length);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(ozId.length);
      return undefined;
    }
    setShown(0);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        setShown((count) => {
          if (count + 1 >= ozId.length && timer) clearInterval(timer);
          return Math.min(ozId.length, count + 1);
        });
      }, CHAR_MS);
    }, REVEAL_DELAY_MS);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [ozId]);
  return (
    <span className={cn('relative inline-block', className)}>
      <span className="sr-only" data-testid="oz-id-reveal-full">
        {ozId}
      </span>
      {/* Réserve la largeur finale : rien ne bouge pendant la frappe. */}
      <span aria-hidden="true" className="invisible">
        {ozId}
      </span>
      <span aria-hidden="true" data-testid="oz-id-reveal-typed" className="absolute inset-0">
        {ozId.slice(0, shown)}
      </span>
    </span>
  );
}

/** E16 : cercles fins concentriques du rond central, à très faible opacité (splash). */
export function PitchCircles({ className }: { className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      className={cn(
        'pointer-events-none text-oz-primary opacity-10 motion-safe:animate-oz-spin-slow',
        className,
      )}
    >
      <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="0.75" />
      <circle
        cx="100"
        cy="100"
        r="64"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeDasharray="2 6"
      />
      <circle cx="100" cy="100" r="32" stroke="currentColor" strokeWidth="0.75" />
      <circle cx="100" cy="100" r="2" fill="currentColor" />
    </svg>
  );
}

export interface GlassPanelProps {
  children: ReactNode;
  testId?: string | undefined;
  className?: string | undefined;
}

/*
 * E18 : verre dépoli (panneaux marketing). Coûteux pour le GPU : seulement si le navigateur le
 * permet et sans mouvement réduit ; sinon fond opaque `surface-1`.
 */
export function GlassPanel({ children, testId = 'glass-panel', className }: GlassPanelProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'rounded-2xl border border-oz-border bg-oz-surface-1 p-5',
        'supports-backdrop-filter:motion-safe:border-oz-text/10 supports-backdrop-filter:motion-safe:bg-oz-bg/85 supports-backdrop-filter:motion-safe:backdrop-blur-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface FloatingChipProps {
  children: ReactNode;
  /** Rang : déphase le flottement d'une seconde par puce. */
  index?: number | undefined;
  className?: string | undefined;
}

/** E20 : petite étiquette (drapeau et pays) qui flotte de ± 4 px en 6 s, déphasée. */
export function FloatingChip({ children, index = 0, className }: FloatingChipProps) {
  return (
    <span
      data-floating=""
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border border-oz-border bg-oz-surface-2 px-3 text-xs font-semibold text-oz-text motion-safe:animate-oz-float',
        className,
      )}
      style={{ animationDelay: `${String(-1000 * Math.max(0, Math.floor(index)))}ms` }}
    >
      {children}
    </span>
  );
}
