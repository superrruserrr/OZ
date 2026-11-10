'use client';

import { cn } from '../lib/cn.js';
import { cssomStyle } from '../lib/cssom-style.js';

export interface MeasureBarProps {
  /** Nom de la mesure, déjà traduit (« Vitesse sur 30 m »). */
  label: string;
  value: number;
  max: number;
  unit?: string | undefined;
  /** Texte de valeur déjà formaté ; vaut « valeur unité » par défaut. */
  valueText?: string | undefined;
  /** Rang dans une liste : décalage de 60 ms par barre (E12). */
  index?: number | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

/*
 * Barre de mesure (design.md §8.6, E12) : une mesure brute certifiée, jamais une note ni un score
 * agrégé (OZ Score retiré, Q18). Remplissage de 0 à la valeur en 500 ms par `transform: scaleX`,
 * décalé de 60 ms par rang ; pleine d'emblée avec mouvement réduit.
 */
export function MeasureBar({
  label,
  value,
  max,
  unit,
  valueText,
  index = 0,
  testId = 'measure-bar',
  className,
}: MeasureBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value / safeMax)) : 0;
  const text = valueText ?? (unit ? `${String(value)} ${unit}` : String(value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuetext={text}
      data-testid={testId}
      className={cn('flex w-full flex-col gap-1.5', className)}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-oz-text-muted" aria-hidden="true">
          {label}
        </span>
        <span className="font-semibold text-oz-text tabular-nums" aria-hidden="true">
          {text}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-oz-surface-input">
        <div
          data-testid={`${testId}-fill`}
          className="h-full w-full origin-left animate-oz-grow rounded-full bg-oz-primary"
          ref={cssomStyle({
            transform: `scaleX(${String(Math.round(ratio * 1000) / 1000)})`,
            animationDelay: `${String(Math.max(0, Math.floor(index)) * 60)}ms`,
          })}
        />
      </div>
    </div>
  );
}
