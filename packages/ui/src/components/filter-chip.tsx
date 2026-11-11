import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface FilterChipProps {
  children: ReactNode;
  pressed: boolean;
  onPressedChange?: ((pressed: boolean) => void) | undefined;
  /** Retrait d'un filtre appliqué : bouton « × » affiché quand la puce est active. */
  onRemove?: (() => void) | undefined;
  /** Libellé accessible déjà traduit du « × » (« Retirer Milieu »). */
  removeLabel?: string | undefined;
  /** `data-testid` de la puce ; « × » : `{testId}-remove`. */
  testId: string;
  disabled?: boolean | undefined;
}

/*
 * Puce de filtre (design.md §8.6) : bouton à bascule (`aria-pressed`) ; active, fond vert plein et
 * texte foncé ; appliquée, un « × » libellé la retire.
 */
export function FilterChip({
  children,
  pressed,
  onPressedChange,
  onRemove,
  removeLabel,
  testId,
  disabled = false,
}: FilterChipProps) {
  const removable = pressed && onRemove && removeLabel;
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        aria-pressed={pressed}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onPressedChange?.(!pressed)}
        className={cn(
          'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap',
          'transition-[background-color,border-color,color] duration-150',
          'disabled:cursor-not-allowed disabled:text-oz-text-disabled',
          pressed
            ? 'border-oz-primary bg-oz-primary text-oz-on-primary'
            : 'border-oz-border bg-oz-surface-2 text-oz-text',
          removable && 'rounded-r-none pr-2',
        )}
      >
        {children}
      </button>
      {removable ? (
        <button
          type="button"
          aria-label={removeLabel}
          data-testid={`${testId}-remove`}
          disabled={disabled}
          onClick={onRemove}
          className="inline-flex h-11 items-center rounded-r-full border border-l-0 border-oz-primary bg-oz-primary pr-4 pl-1 text-oz-on-primary"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
            <path
              d="m4.5 4.5 7 7m0-7-7 7"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}
