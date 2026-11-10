import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface CheckListProps {
  /** Éléments déjà traduits (ce que le tuteur contrôlera, design.md §8.9 n° 4). */
  items: readonly ReactNode[];
  className?: string | undefined;
}

/** Liste à coches (design.md §8.6, écran 05) : liste sémantique, coches vertes décoratives. */
export function CheckList({ items, className }: CheckListProps) {
  return (
    <ul className={cn('flex flex-col gap-2 text-sm text-oz-text', className)}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-oz-primary"
          >
            <path
              d="m3.5 8.5 3 3 6-7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
