'use client';

import { cn } from '../lib/cn.js';
import { cssomStyle } from '../lib/cssom-style.js';

export interface StepProgressProps {
  /** Étape courante, de 0 à `total`. */
  step: number;
  total: number;
  /** Libellé déjà traduit de la barre (« Étape 2 sur 5 »). */
  label: string;
  /** Libellé du bouton retour ; le bouton n'apparaît qu'avec `onBack`. */
  backLabel?: string | undefined;
  onBack?: (() => void) | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

function bounded(step: number, total: number): { now: number; max: number } {
  const max = Number.isFinite(total) ? Math.max(1, Math.round(total)) : 1;
  const now = Number.isFinite(step) ? Math.min(max, Math.max(0, Math.round(step))) : 0;
  return { now, max };
}

/*
 * Progression d'étape (design.md §8.6, écrans 02-05) : retour à gauche, compteur « 2 / 5 » à droite,
 * piste fine de 3 px. E7 : remplissage animé en 300 ms par `transform: scaleX` (GPU) ; avec
 * mouvement réduit, base.css coupe la transition et la barre saute à sa valeur.
 */
export function StepProgress({
  step,
  total,
  label,
  backLabel,
  onBack,
  testId = 'step-progress',
  className,
}: StepProgressProps) {
  const { now, max } = bounded(step, total);
  return (
    <div data-testid={testId} className={cn('flex w-full flex-col gap-3', className)}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {onBack && backLabel ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            data-testid={`${testId}-back`}
            className="-ml-2 grid size-11 place-items-center rounded-full text-oz-text"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <span />
        )}
        <span
          aria-hidden="true"
          data-testid={`${testId}-counter`}
          className="text-sm font-medium text-oz-text-muted tabular-nums"
        >
          {now} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={now}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-[3px] w-full overflow-hidden rounded-full bg-oz-surface-input"
      >
        <div
          data-testid={`${testId}-fill`}
          className="h-full w-full origin-left rounded-full bg-oz-primary transition-transform duration-300 ease-out"
          ref={cssomStyle({ transform: `scaleX(${String(now / max)})` })}
        />
      </div>
    </div>
  );
}
