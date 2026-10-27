import { cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Badge de statut (design.md §8.4) : pilule à contour fin. Chaque couleur a un seul sens : vert =
 * vérifié, ambre = KYC, bleu = légal (texte `legal-text`, M8), rouge = danger uniquement.
 */
const badgeVariants = cva(
  'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        verified: 'border-oz-primary/40 text-oz-primary',
        kyc: 'border-oz-kyc-border text-oz-kyc',
        legal: 'border-oz-legal-border bg-oz-legal-bg text-oz-legal-text',
        danger: 'border-oz-danger/40 text-oz-danger',
        neutral: 'border-oz-border text-oz-text-muted',
      },
    },
  },
);

export type BadgeTone = 'verified' | 'kyc' | 'legal' | 'danger' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
  /** Statut métier porté par `data-testid="badge-{status}"` ; vaut le ton par défaut. */
  status?: string;
}

export function Badge({ tone, status, className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      data-testid={`badge-${status ?? tone}`}
      data-tone={tone}
      className={cn(badgeVariants({ tone }), className)}
    />
  );
}
