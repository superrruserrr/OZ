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
  /**
   * Remplissage déclenché à l'entrée de la barre à l'écran (bandeaux de la direction sport) plutôt
   * qu'au montage ; joué d'emblée si le navigateur n'a pas `IntersectionObserver`.
   */
  animateOnView?: boolean | undefined;
  /** Crans tous les 10 % sur la piste, façon jauge de jeu (lot 1.5eb) ; décoratifs. */
  segmented?: boolean | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

/*
 * Barre de mesure (design.md §8.6, E12) : une mesure brute certifiée, jamais une note ni un score
 * agrégé (OZ Score retiré, Q18). Remplissage de 0 à la valeur en 500 ms par `transform: scaleX`,
 * décalé de 60 ms par rang ; pleine d'emblée avec mouvement réduit.
 */
const NOTCHES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function MeasureBar({
  label,
  value,
  max,
  unit,
  valueText,
  index = 0,
  animateOnView = false,
  segmented = false,
  testId = 'measure-bar',
  className,
}: MeasureBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value / safeMax)) : 0;
  const text = valueText ?? (unit ? `${String(value)} ${unit}` : String(value));
  const applyStyle = cssomStyle({
    transform: `scaleX(${String(Math.round(ratio * 1000) / 1000)})`,
    animationDelay: `${String(Math.max(0, Math.floor(index)) * 60)}ms`,
  });
  const fillRef = (element: HTMLDivElement | null) => {
    applyStyle(element);
    if (!element || !animateOnView) return undefined;
    const play = () => {
      element.dataset.inview = 'true';
    };
    if (typeof IntersectionObserver !== 'function') {
      play();
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        play();
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  };
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
        <span className="font-medium text-oz-text tabular-nums" aria-hidden="true">
          {text}
        </span>
      </div>
      <div
        className={cn(
          'relative w-full overflow-hidden bg-oz-surface-input',
          segmented ? 'h-2.5 rounded-sm' : 'h-2 rounded-full',
        )}
      >
        <div
          data-testid={`${testId}-fill`}
          className={cn(
            'h-full w-full origin-left animate-oz-grow rounded-full bg-oz-primary',
            animateOnView &&
              'motion-safe:[animation-play-state:paused] data-[inview=true]:[animation-play-state:running]',
          )}
          ref={fillRef}
        />
        {segmented ? (
          <div aria-hidden="true" className="absolute inset-0 flex justify-evenly">
            {NOTCHES.map((notch) => (
              <span key={notch} data-part="notch" className="h-full w-0.5 bg-oz-bg" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
