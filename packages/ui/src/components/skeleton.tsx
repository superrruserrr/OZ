import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface SkeletonProps {
  /** Taille et forme du bloc (`h-4 w-40`, `size-12 rounded-full`). */
  className?: string | undefined;
}

/*
 * Bloc de squelette (design.md §8.7, E14) : `surface-2` avec un balayage lumineux lent (1,5 s) en
 * transform, préféré au spinner en 3G. Décoratif ; balayage coupé avec mouvement réduit.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block overflow-hidden rounded-lg bg-oz-surface-2',
        'after:absolute after:inset-0 after:animate-oz-shimmer motion-reduce:after:hidden',
        'after:bg-linear-90 after:from-transparent after:via-oz-surface-input/60 after:to-transparent',
        className,
      )}
    />
  );
}

export interface SkeletonGroupProps {
  /** Libellé déjà traduit, annoncé une fois (« Chargement des résultats »). */
  label: string;
  children: ReactNode;
  testId?: string | undefined;
  className?: string | undefined;
}

/** Conteneur de squelettes : occupé (`aria-busy`) et nommé, pour un seul message aux lecteurs d'écran. */
export function SkeletonGroup({
  label,
  children,
  testId = 'skeleton',
  className,
}: SkeletonGroupProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid={testId}
      className={cn('flex flex-col gap-3', className)}
    >
      {children}
    </div>
  );
}
