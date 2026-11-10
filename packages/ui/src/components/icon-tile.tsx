import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

const SIZES = { sm: 'size-11 rounded-xl', md: 'size-12 rounded-xl', lg: 'size-14 rounded-2xl' };

export interface IconTileProps {
  /** Icône fournie par l'appelant (trait, `currentColor`). */
  children: ReactNode;
  size?: keyof typeof SIZES | undefined;
  className?: string | undefined;
}

/** Tuile d'icône (design.md §8.6) : carré arrondi de 44 à 56 px, fond `tint-green`, décoratif. */
export function IconTile({ children, size = 'md', className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center bg-oz-tint-green text-oz-primary [&>svg]:size-6',
        SIZES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
