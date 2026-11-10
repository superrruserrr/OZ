'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { IconTile } from './icon-tile.js';

export interface ChoiceOption {
  value: string;
  /** Titre déjà traduit. */
  title: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  disabled?: boolean | undefined;
}

export interface ChoiceCardGroupProps {
  /** Libellé déjà traduit du groupe (« Type de compte »). */
  label: string;
  options: readonly ChoiceOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  /** Préfixe des cartes : `{testId}-{value}` (`role-card-player`). */
  testId: string;
  className?: string | undefined;
}

/*
 * Cartes de choix (écran 02, design.md §8.6, E9) : groupe radio à un seul arrêt de tabulation ;
 * flèches pour se déplacer et cocher (en sautant les cartes désactivées), espace pour cocher.
 * Sélection : contour vert et pastille cochée en « pop » (0,6 → 1, 200 ms), statique avec
 * mouvement réduit.
 */
export function ChoiceCardGroup({
  label,
  options,
  value,
  onValueChange,
  testId,
  className,
}: ChoiceCardGroupProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const tabStop = selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? -1);

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    refs.current[index]?.focus();
    onValueChange(option.value);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step === undefined || enabled.length === 0) return;
    event.preventDefault();
    const position = enabled.indexOf(index);
    const next = enabled[(position + step + enabled.length) % enabled.length];
    if (next !== undefined) choose(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex w-full flex-col gap-3', className)}
    >
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={option.disabled ? true : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            data-testid={`${testId}-${option.value}`}
            data-state={checked ? 'checked' : 'unchecked'}
            onClick={() => {
              choose(index);
            }}
            onKeyDown={(event) => {
              onKeyDown(index, event);
            }}
            className={cn(
              'relative flex min-h-16 w-full items-center gap-4 rounded-[14px] border bg-oz-surface-2 p-4 text-left text-oz-text',
              'transition-[border-color] duration-200',
              checked ? 'border-oz-primary' : 'border-oz-border',
              option.disabled && 'cursor-not-allowed text-oz-text-disabled',
            )}
          >
            {option.icon ? <IconTile>{option.icon}</IconTile> : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-8">
              <span className="font-semibold">{option.title}</span>
              {option.description ? (
                <span className="text-sm text-oz-text-muted">{option.description}</span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-1/2 right-4 grid size-6 -translate-y-1/2 place-items-center rounded-full border',
                checked
                  ? 'border-oz-primary bg-oz-primary text-oz-on-primary [&>svg]:motion-safe:animate-oz-pop'
                  : 'border-oz-border',
              )}
            >
              {checked ? (
                <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                  <path
                    d="m3.5 8.5 3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
