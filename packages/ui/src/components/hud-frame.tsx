import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn.js';

export interface HudFrameProps {
  /** Titre de la section, déjà traduit. */
  title: string;
  /** Sur-titre court en capitales (« Données réelles »). */
  kicker?: string | undefined;
  /** Illustration de fond, décorative : lignes de terrain ou grille hexagonale. */
  illustration?: 'pitch' | 'hex' | 'none' | undefined;
  /** Élément placé à droite du titre (badge « Bientôt disponible »…). */
  aside?: ReactNode | undefined;
  children: ReactNode;
  testId?: string | undefined;
  className?: string | undefined;
}

function Illustration({ kind }: { kind: 'pitch' | 'hex' }) {
  return (
    <svg
      aria-hidden="true"
      data-illustration={kind}
      viewBox="0 0 320 160"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-x-0 top-0 h-32 w-full stroke-oz-primary/[0.07]"
      fill="none"
      strokeWidth="1.5"
    >
      {kind === 'pitch' ? (
        <>
          <rect x="8" y="8" width="304" height="144" rx="4" />
          <path d="M160 8v144" />
          <circle cx="160" cy="80" r="26" />
          <rect x="8" y="44" width="40" height="72" />
          <rect x="272" y="44" width="40" height="72" />
        </>
      ) : (
        <path d="M220 20l20-12 20 12v24l-20 12-20-12zM260 44l20-12 20 12v24l-20 12-20-12zM220 68l20-12 20 12v24l-20 12-20-12zM260 92l20-12 20 12v24l-20 12-20-12zM300 20l20-12 20 12v24l-20 12-20-12z" />
      )}
    </svg>
  );
}

const CORNER = 'pointer-events-none absolute size-3 border-oz-primary/70';

/*
 * Cadre « tête haute » des statistiques (lot 1.5eb) : coins lumineux, sur-titre en capitales et une
 * illustration de fond légère (terrain ou hexagones). Décor seulement : le contenu reste du texte.
 */
export function HudFrame({
  title,
  kicker,
  illustration = 'none',
  aside,
  children,
  testId = 'hud-frame',
  className,
}: HudFrameProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      className={cn(
        'relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border border-oz-border bg-oz-surface-1 p-4 sm:p-5',
        className,
      )}
    >
      {illustration === 'none' ? null : <Illustration kind={illustration} />}
      <span aria-hidden="true" className={cn(CORNER, 'top-2 left-2 border-t-2 border-l-2')} />
      <span aria-hidden="true" className={cn(CORNER, 'top-2 right-2 border-t-2 border-r-2')} />
      <span aria-hidden="true" className={cn(CORNER, 'bottom-2 left-2 border-b-2 border-l-2')} />
      <span aria-hidden="true" className={cn(CORNER, 'right-2 bottom-2 border-r-2 border-b-2')} />
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {kicker ? (
            <p className="text-xs font-medium tracking-[0.12em] text-oz-primary uppercase">
              {kicker}
            </p>
          ) : null}
          <h2 id={titleId} className="font-display text-lg font-medium text-oz-text">
            {title}
          </h2>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
