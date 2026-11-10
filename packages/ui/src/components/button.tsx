'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { Spinner } from './spinner.js';

/*
 * Bouton (design.md §8.4, §8.6, §8.7). Le dégradé du bouton principal est un calque `::before` dont
 * seule l'opacité change : E4 (le vert s'allume en 200 ms quand l'action devient possible) reste
 * animé sur le GPU. E3 : survol plus lumineux avec ombre verte, appui à 0,98. Ombre et mise à l'échelle
 * n'existent que sous `motion-safe` (une classe `motion-reduce` perdrait face à la spécificité de
 * `data-[state=active]:active:`) ; les transitions sont coupées par base.css.
 */
const buttonVariants = cva(
  [
    'relative isolate inline-flex items-center justify-center gap-2 overflow-hidden font-semibold',
    'select-none transition-[transform,box-shadow,filter,color,border-color] duration-200',
    'disabled:cursor-not-allowed data-[state=inactive]:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-oz-surface-input text-oz-text-disabled',
          'before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-linear-135',
          'before:from-oz-primary-from before:to-oz-primary-to before:opacity-0',
          'before:transition-opacity before:duration-200',
          'data-[state=active]:text-oz-on-primary data-[state=active]:before:opacity-100',
          'data-[state=active]:hover:brightness-110',
          'data-[state=active]:hover:motion-safe:shadow-[0_8px_24px_color-mix(in_srgb,var(--oz-primary)_25%,transparent)]',
          'data-[state=active]:active:motion-safe:scale-[0.98] data-[state=active]:active:duration-100',
        ],
        secondary: [
          'border border-oz-text-disabled bg-transparent text-oz-text',
          'data-[state=active]:hover:border-oz-text-muted data-[state=active]:active:motion-safe:scale-[0.98]',
          'data-[state=inactive]:border-oz-border data-[state=inactive]:text-oz-text-disabled',
        ],
      },
      size: {
        md: 'h-14 rounded-[14px] px-6 text-base',
        sm: 'h-10 rounded-xl px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Rend l'enfant unique (un lien, par exemple) avec le style et les props du bouton. */
  asChild?: boolean;
  /** Action en cours : bouton inactif, `aria-busy`, libellé conservé. */
  loading?: boolean;
}

export function Button({
  asChild = false,
  loading = false,
  disabled = false,
  variant,
  size,
  className,
  type,
  children,
  ...props
}: ButtonProps) {
  const inactive = disabled || loading;
  const variantName = variant ?? 'primary';
  const shared = {
    ...props,
    'data-variant': variantName,
    'data-state': inactive ? 'inactive' : 'active',
    className: cn(buttonVariants({ variant: variantName, size }), className),
  };
  if (asChild) return <Slot {...shared}>{children}</Slot>;
  return (
    <button
      {...shared}
      type={type ?? 'button'}
      disabled={inactive}
      {...(loading ? { 'aria-busy': true } : {})}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
