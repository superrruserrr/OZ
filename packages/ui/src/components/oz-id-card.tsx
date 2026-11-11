'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { cssomStyle } from '../lib/cssom-style.js';
import { OzIdReveal } from './emotion.js';

export interface OzIdCardProps {
  /** Nom affiché (prénom et nom). */
  name: string;
  /** OZ ID au format `OZ-CM-26-7K4M9Q-3` (EX-102). */
  ozId: string;
  /** Libellé déjà traduit au-dessus de l'OZ ID. */
  ozIdLabel: string;
  /** Poste, âge, pays, pied, déjà traduits ; les valeurs vides sont omises. */
  details?: readonly (string | null | undefined)[] | undefined;
  /** QR de l'OZ ID, généré par l'appelant. */
  qr?: ReactNode | undefined;
  /** Badge de vérification (`Badge`), selon le statut lu sur le serveur. */
  badge?: ReactNode | undefined;
  /**
   * E2, fin d'inscription seulement : la carte monte, l'OZ ID se tape, le QR apparaît en fondu.
   * Jamais lié à l'âge du joueur.
   */
  reveal?: boolean | undefined;
  className?: string | undefined;
}

/** Initiales : première lettre du premier et du dernier mot, en capitales. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toLocaleUpperCase('fr');
}

/*
 * Carte OZ ID (écran 06, design.md §8.6) : `surface-ozid`, avatar en initiales (sans photo, lot
 * 1.13b, Q22), nom, détails, séparateur, OZ ID en mono vert sans coupure, QR et badge. Aucun effet ni
 * mise en avant liés à l'âge (EX-T16 n° 2, §8.7) ; le halo E1 est posé autour par l'écran (lot 1.5bb).
 */
export function OzIdCard({
  name,
  ozId,
  ozIdLabel,
  details = [],
  qr,
  badge,
  reveal = false,
  className,
}: OzIdCardProps) {
  const line = details.filter((detail): detail is string => Boolean(detail?.trim())).join(' · ');
  return (
    <article
      data-testid="oz-id-card"
      className={cn(
        'flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-ozid p-5 text-oz-text',
        reveal && 'motion-safe:animate-oz-rise',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          data-testid="oz-id-card-avatar"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-oz-tint-green text-lg font-medium text-oz-primary"
        >
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-lg font-medium">{name}</h2>
          {line ? (
            <p data-testid="oz-id-card-details" className="text-sm text-oz-text-muted">
              {line}
            </p>
          ) : null}
        </div>
      </div>
      <hr className="border-oz-border" />
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium tracking-[0.08em] text-oz-text-label uppercase">
            {ozIdLabel}
          </span>
          <span
            data-testid="oz-id-card-value"
            className="font-mono text-base font-medium whitespace-nowrap text-oz-primary select-all"
          >
            {reveal ? <OzIdReveal ozId={ozId} /> : ozId}
          </span>
          {badge ? <div>{badge}</div> : null}
        </div>
        {qr ? (
          <div
            data-testid="oz-id-card-qr"
            className={cn(
              'grid size-24 shrink-0 place-items-center rounded-xl bg-oz-primary p-2 text-oz-on-primary',
              reveal && 'motion-safe:animate-oz-fade-in',
            )}
            ref={
              reveal
                ? cssomStyle({ animationDelay: `${String(500 + 40 * ozId.length)}ms` })
                : undefined
            }
          >
            {qr}
          </div>
        ) : null}
      </div>
    </article>
  );
}
