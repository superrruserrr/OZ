'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn.js';
import { controlClassName } from './field-shell.js';

const LENGTH = 6;

export interface OtpInputProps {
  /** Préfixe des identifiants (libellé, erreur). */
  id: string;
  /** Libellé déjà traduit du groupe (« Code reçu par SMS »). */
  label: string;
  /** Libellé de chaque case (« Chiffre 3 sur 6 »). */
  digitLabel: (position: number, total: number) => string;
  /** Appelé une fois quand les 6 chiffres sont saisis, de nouveau seulement si le code change. */
  onComplete: (code: string) => void;
  /** Message d'erreur déjà traduit ; secousse et contour rouge (E8). */
  error?: string | null | undefined;
  /** Bouton de renvoi : libellé et décompte pilotés par l'appelant (« Renvoyer dans 42 s »). */
  resendLabel?: string | undefined;
  resendDisabled?: boolean | undefined;
  onResend?: (() => void) | undefined;
  disabled?: boolean | undefined;
  /** `data-testid` du groupe ; cases `{testId}-digit-{n}`, renvoi `{testId}-resend`. */
  testId?: string | undefined;
}

const EMPTY: readonly string[] = Array.from({ length: LENGTH }, () => '');

/*
 * Code à 6 chiffres (écran 04, design.md §8.6, E8) : chiffres seuls, case suivante automatique,
 * retour arrière vers la précédente, collage d'un code complet, `one-time-code` pour le SMS. La
 * case active a le contour vert du champ (E5) ; une erreur secoue le groupe (3 × 4 px, 300 ms), et
 * le contour rouge seul reste avec mouvement réduit. Aucun minuteur caché : le renvoi est piloté
 * par l'appelant.
 */
export function OtpInput({
  id,
  label,
  digitLabel,
  onComplete,
  error,
  resendLabel,
  resendDisabled = false,
  onResend,
  disabled = false,
  testId = 'otp',
}: OtpInputProps) {
  const [digits, setDigits] = useState<readonly string[]>(EMPTY);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const completed = useRef<string | null>(null);
  const labelId = `${id}-label`;
  const errorId = error ? `${id}-error` : undefined;

  function commit(next: readonly string[], focusIndex: number) {
    setDigits(next);
    inputs.current[Math.min(LENGTH - 1, Math.max(0, focusIndex))]?.focus();
    const code = next.join('');
    if (code.length < LENGTH) {
      completed.current = null;
    } else if (completed.current !== code) {
      completed.current = code;
      onComplete(code);
    }
  }

  function fill(from: number, text: string) {
    const typed = text.replace(/\D/g, '').slice(0, LENGTH - from);
    if (!typed) return;
    const next = [...digits];
    for (let offset = 0; offset < typed.length; offset += 1) {
      next[from + offset] = typed.charAt(offset);
    }
    commit(next, from + typed.length);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        commit(next, index);
      } else if (index > 0) {
        next[index - 1] = '';
        commit(next, index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      inputs.current[Math.max(0, index - 1)]?.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      inputs.current[Math.min(LENGTH - 1, index + 1)]?.focus();
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fill(index, event.clipboardData.getData('text'));
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <span
        id={labelId}
        className="text-xs font-semibold tracking-[0.08em] text-oz-text-label uppercase"
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        data-testid={testId}
        key={error ?? ''}
        className={cn('flex gap-2', error ? 'animate-oz-shake' : undefined)}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element;
            }}
            id={index === 0 ? id : undefined}
            data-testid={`${testId}-digit-${String(index + 1)}`}
            aria-label={digitLabel(index + 1, LENGTH)}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            disabled={disabled}
            value={digit}
            onChange={(event) => {
              fill(index, event.target.value.replace(digit, '') || event.target.value);
            }}
            onKeyDown={(event) => {
              onKeyDown(index, event);
            }}
            onPaste={(event) => {
              onPaste(index, event);
            }}
            onFocus={(event) => {
              event.target.select();
            }}
            className={cn(
              controlClassName,
              'h-14 min-w-0 flex-1 px-0 text-center text-xl font-semibold',
            )}
          />
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-oz-danger">
          {error}
        </p>
      ) : null}
      {resendLabel && onResend ? (
        <button
          type="button"
          data-testid={`${testId}-resend`}
          disabled={resendDisabled}
          onClick={onResend}
          className="self-start text-sm font-semibold text-oz-primary disabled:cursor-not-allowed disabled:text-oz-text-muted"
        >
          {resendLabel}
        </button>
      ) : null}
    </div>
  );
}
