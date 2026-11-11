import { cn } from '@oz/ui';
import type { ReactNode } from 'react';

/** Conteneur des pages publiques (lot 1.5cba) : largeur de la topbar, gouttières 16 px puis 24 px. */
export function SiteSection({
  children,
  narrow = false,
  className,
}: {
  children: ReactNode;
  /** Colonne de lecture (textes, formulaires) plutôt que pleine grille. */
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 pt-10 sm:px-6 sm:pt-16',
        narrow ? 'max-w-3xl' : 'max-w-6xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
