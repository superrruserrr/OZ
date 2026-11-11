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
      // Pilule remplie (direction sport, ADR-011) : fond teinté à 10 % du ton, texte inchangé.
      filled: { true: '', false: '' },
    },
    compoundVariants: [
      { tone: 'verified', filled: true, class: 'bg-oz-primary/10' },
      { tone: 'kyc', filled: true, class: 'bg-oz-kyc/10' },
      { tone: 'danger', filled: true, class: 'bg-oz-danger/10' },
      { tone: 'neutral', filled: true, class: 'bg-oz-surface-2' },
    ],
  },
);

export type BadgeTone = 'verified' | 'kyc' | 'legal' | 'danger' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
  /** Statut métier porté par `data-testid="badge-{status}"` ; vaut le ton par défaut. */
  status?: string;
  /** Statut confirmé par la réponse du serveur (CP-19). */
  confirmed?: boolean;
  /**
   * Joue le tampon E13 (1,15 → 1, 300 ms). À ne poser qu'au moment où le serveur vient de confirmer
   * le statut, jamais à l'affichage d'un statut déjà connu ; sans effet sans `confirmed`.
   */
  animate?: boolean;
  /** Fond teinté du ton (pilules de héros et de cartes) ; le bleu légal a déjà son fond. */
  filled?: boolean;
}

export function Badge({
  tone,
  status,
  confirmed = false,
  animate = false,
  filled = false,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      data-testid={`badge-${status ?? tone}`}
      data-tone={tone}
      {...(filled ? { 'data-filled': 'true' } : {})}
      className={cn(
        badgeVariants({ tone, filled }),
        confirmed && animate && 'motion-safe:animate-oz-stamp',
        className,
      )}
    />
  );
}
