'use client';

import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { controlClassName, FieldShell } from './field-shell.js';
import { Spinner } from './spinner.js';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  meta?: string;
  hint?: string;
  error?: string | null;
  /** Vérification en cours (disponibilité, format distant) : `aria-busy`. */
  loading?: boolean;
}

/** Champ de saisie (design.md §8.6) : libellé majuscule, fond `surface-input`, focus vert (E5). */
export function Field({
  id,
  label,
  meta,
  hint,
  error,
  loading = false,
  className,
  ...props
}: FieldProps) {
  return (
    <FieldShell id={id} label={label} meta={meta} hint={hint} error={error}>
      {({ describedBy, invalid }) => (
        <div className="relative">
          <input
            {...props}
            id={id}
            className={cn(controlClassName, loading && 'pr-11', className)}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            {...(invalid ? { 'aria-invalid': true } : {})}
            {...(loading ? { 'aria-busy': true } : {})}
          />
          {loading ? (
            <Spinner className="absolute top-1/2 right-4 -translate-y-1/2 text-oz-primary" />
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
