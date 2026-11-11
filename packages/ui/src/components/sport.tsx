import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Primitives typographiques de la direction « sport » (lot 1.5ca, ADR-011) reprises de la maquette
 * Manus aux couleurs de la charte : petit libellé à puce au-dessus des titres, et titre scindé dont
 * la fin de phrase passe en rose `accent`. Composants serveur, sans JavaScript.
 */

const DOT_TONES = {
  primary: 'bg-oz-primary',
  highlight: 'bg-oz-highlight',
  accent: 'bg-oz-accent',
} as const;

export interface KickerProps {
  children: ReactNode;
  /** Couleur de la puce ; le texte reste `text-label`. */
  tone?: keyof typeof DOT_TONES | undefined;
  className?: string | undefined;
}

/** Libellé de section : majuscules, 11-12 px, espacement 0,08em (design.md §8.5), puce colorée. */
export function Kicker({ children, tone = 'primary', className }: KickerProps) {
  return (
    <p
      data-testid="kicker"
      className={cn(
        'inline-flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-oz-text-label uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', DOT_TONES[tone])} />
      {children}
    </p>
  );
}

/** Taille minimale de chaque titre, en px : le rose n'est admis qu'en grand texte (≥ 24 px). */
export const SPLIT_HEADING_MIN_PX = { hero: 31, section: 28 } as const;

const HEADING_SIZES = {
  // 31 px sur téléphone (design.md §8.5) → 56 px sur grand écran, comme le héros de la maquette.
  hero: 'text-[clamp(1.9375rem,4.2vw+1rem,3.5rem)] leading-[1.05]',
  section: 'text-[clamp(1.75rem,2.4vw+1rem,2.5rem)] leading-[1.12]',
} as const satisfies Record<keyof typeof SPLIT_HEADING_MIN_PX, string>;

export interface SplitHeadingProps {
  as?: 'h1' | 'h2' | 'h3' | undefined;
  /** Début du titre, en couleur de texte. */
  lead: ReactNode;
  /** Fin du titre, en rose : appel émotionnel, grand texte seulement. */
  highlight?: ReactNode | undefined;
  size?: keyof typeof SPLIT_HEADING_MIN_PX | undefined;
  /** Passe la fin du titre à la ligne (héros). */
  breakBeforeHighlight?: boolean | undefined;
  className?: string | undefined;
}

/** Titre fort à deux temps (« Ton talent, *notre mission.* »), Prompt 700, tailles fluides. */
export function SplitHeading({
  as: Tag = 'h2',
  lead,
  highlight,
  size = 'section',
  breakBeforeHighlight = false,
  className,
}: SplitHeadingProps) {
  return (
    <Tag
      className={cn(
        'font-display font-bold tracking-[-0.02em] text-balance text-oz-text',
        HEADING_SIZES[size],
        className,
      )}
    >
      {lead}
      {highlight ? (
        <>
          {breakBeforeHighlight ? <br /> : ' '}
          <em className="text-oz-accent not-italic">{highlight}</em>
        </>
      ) : null}
    </Tag>
  );
}
