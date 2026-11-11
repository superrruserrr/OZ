'use client';

import { Root as Label } from '@radix-ui/react-label';
import type { ReactNode } from 'react';

export interface FieldShellProps {
  id: string;
  /** Libellé déjà traduit, affiché en majuscules au-dessus du champ. */
  label: string;
  /** Méta-information alignée à droite du libellé (« 17 ANS »). */
  meta?: string | undefined;
  hint?: string | undefined;
  /** Message d'erreur déjà traduit ; `null` ou absent = pas d'erreur. */
  error?: string | null | undefined;
  children: (control: { describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Libellé, méta-info, aide et erreur communs au champ et au sélecteur (design.md §8.6). */
export function FieldShell({ id, label, meta, hint, error, children }: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label
          htmlFor={id}
          className="text-xs font-medium tracking-[0.08em] text-oz-text-label uppercase"
        >
          {label}
        </Label>
        {meta ? (
          <span className="text-xs font-medium tracking-[0.08em] text-oz-primary uppercase transition-opacity duration-150 starting:opacity-0">
            {meta}
          </span>
        ) : null}
      </div>
      {children({ describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-sm text-oz-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-oz-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Surface commune des contrôles de saisie ; E5 : contour vert 1,5 px en 150 ms au focus. */
export const controlClassName = [
  'h-12 w-full rounded-xl bg-oz-surface-input px-4 text-base text-oz-text',
  'outline-[1.5px] outline-offset-0 outline-transparent outline-solid',
  'transition-[outline-color] duration-150 placeholder:text-oz-text-muted',
  'focus-visible:outline-oz-primary aria-invalid:outline-oz-danger',
  'disabled:cursor-not-allowed disabled:text-oz-text-disabled',
].join(' ');
