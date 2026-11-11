import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Icônes de sports (lot 1.5da) dessinées pour OZ, sans bibliothèque ni attribut `style` (CSP) : on
 * doit reconnaître d'un coup d'œil un footballeur, un basketteur ou un joueur de tennis. Trait
 * `currentColor` de 1,75 sur une grille de 24, lisible dès 16 px.
 */
export const SPORTS = [
  'football',
  'basketball',
  'tennis',
  'volleyball',
  'handball',
  'rugby',
  'athletics',
] as const;
export type Sport = (typeof SPORTS)[number];

const DRAWINGS: Record<Sport, ReactNode> = {
  // Ballon à pentagone central et coutures vers le bord.
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" />
      <path d="M12 8.2V3M15.6 10.8l4.9-1.6M14.2 15l3 4.2M9.8 15l-3 4.2M8.4 10.8L3.5 9.2" />
    </>
  ),
  // Ballon orange : méridien, équateur et deux coutures courbes.
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18M5.6 5.6c3 2.8 3 10 0 12.8M18.4 5.6c-3 2.8-3 10 0 12.8" />
    </>
  ),
  // Balle de tennis : deux coutures en S face à face.
  tennis: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.2 5.8c3.4 3.2 3.4 9.2 0 12.4M18.8 5.8c-3.4 3.2-3.4 9.2 0 12.4" />
    </>
  ),
  // Ballon de volley : trois panneaux en spirale.
  volleyball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12c0-4 1.6-7 4.6-8.4M12 12c-3.5 2-6.8 2-9-.3M12 12c3.4 2 5 5 4.6 8.4" />
    </>
  ),
  // Ballon de handball tenu : ballon et pouce de la main qui le saisit.
  handball: (
    <>
      <circle cx="13" cy="10" r="6.5" />
      <path d="M9 7.5c2.5 1 5.5 1 8 0M8.6 12.6c2.6-1 6.2-1 8.8 0" />
      <path d="M4 21v-5.5a2 2 0 0 1 4 0V18l3-2.2a1.8 1.8 0 0 1 2.2 2.8L9.5 21.5" />
    </>
  ),
  // Ballon ovale incliné et lacets.
  rugby: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)" />
      <path d="M8.2 15.8l7.6-7.6M10 12.6l1.4 1.4M11.6 11l1.4 1.4M13.2 9.4l1.4 1.4" />
    </>
  ),
  // Coureur en pleine foulée sur la ligne.
  athletics: (
    <>
      <circle cx="15" cy="4.5" r="1.8" />
      <path d="M8 21l3.2-5.4 3 2.4v3M11.2 15.6l1.6-5.4 3.4 2.6 3 .2M12.8 10.2L9 9.4l-3 2.6" />
      <path d="M3 21h18" />
    </>
  ),
};

/** Tracé seul, à poser dans un autre SVG (grille 24 × 24, trait `currentColor`). */
export function SportGlyph({ sport, className }: { sport: Sport; className?: string | undefined }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {DRAWINGS[sport]}
    </g>
  );
}

export interface SportIconProps {
  sport: Sport;
  /** Nom lu par les lecteurs d'écran ; sans titre, l'icône est décorative. */
  title?: string | undefined;
  className?: string | undefined;
}

export function SportIcon({ sport, title, className }: SportIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-sport={sport}
      className={cn('size-5 shrink-0', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true' as const })}
    >
      {DRAWINGS[sport]}
    </svg>
  );
}

/** Teinte par sport : distinctes en clarté aussi, jamais la seule information (le nom suit). */
const TAG_TONES: Record<Sport, string> = {
  football: 'text-oz-primary',
  basketball: 'text-oz-kyc',
  tennis: 'text-oz-primary',
  volleyball: 'text-oz-highlight',
  handball: 'text-oz-highlight',
  rugby: 'text-oz-kyc',
  athletics: 'text-oz-text',
};

export interface SportTagProps {
  sport: Sport;
  /** Nom du sport, déjà traduit. */
  label: string;
  className?: string | undefined;
}

/** Pastille icône + nom : le sport se lit à l'œil et au lecteur d'écran. */
export function SportTag({ sport, label, className }: SportTagProps) {
  return (
    <span
      data-testid={`sport-tag-${sport}`}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-oz-border bg-oz-surface-2 pr-3 pl-2 text-xs font-medium text-oz-text',
        className,
      )}
    >
      <SportIcon sport={sport} className={cn('size-4', TAG_TONES[sport])} />
      {label}
    </span>
  );
}
