import type { ReactNode } from 'react';
import { GlassPanel } from './emotion.js';

export interface LiveFact {
  /** Libellé court, déjà traduit. */
  label: string;
  /** Valeur déjà traduite ; un chiffre seulement s'il est réel et branché sur la base (M5). */
  value: string;
}

export interface LivePanelProps {
  /** Statut affiché à côté de la pastille (« Inscriptions bientôt ouvertes »…). */
  status: string;
  title: ReactNode;
  /** Fin du titre en rose (grand texte). */
  highlight?: ReactNode | undefined;
  /** Texte d'appui. */
  children?: ReactNode | undefined;
  facts?: readonly LiveFact[] | undefined;
  className?: string | undefined;
}

/*
 * Panneau latéral du héros (lot 1.5ca) d'après la carte « LIVE NETWORK » de la maquette Manus :
 * verre dépoli (E18, repli opaque), pastille qui pulse en opacité seule, titre, texte et faits. Le
 * composant n'affiche aucun chiffre de lui-même : pas de compteur fictif (M5, design.md §8.10).
 */
export function LivePanel({
  status,
  title,
  highlight,
  children,
  facts,
  className,
}: LivePanelProps) {
  return (
    <GlassPanel testId="live-panel" className={className}>
      <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.08em] text-oz-primary uppercase">
        <span className="relative grid size-2.5 place-items-center" aria-hidden="true">
          <span
            data-testid="live-dot"
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-oz-primary/40 motion-safe:animate-oz-pulse"
          />
          <span className="size-1.5 rounded-full bg-oz-primary" />
        </span>
        {status}
      </p>
      <p className="mt-4 font-display text-2xl leading-tight font-medium text-oz-text">
        {title}
        {highlight ? (
          <>
            <br />
            <em className="text-oz-accent not-italic">{highlight}</em>
          </>
        ) : null}
      </p>
      {children ? (
        <p className="mt-3 text-sm leading-relaxed text-oz-text-muted">{children}</p>
      ) : null}
      {facts && facts.length > 0 ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-oz-border pt-4 sm:grid-cols-3 lg:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] font-medium tracking-[0.08em] text-oz-text-label uppercase">
                {fact.label}
              </dt>
              <dd className="mt-1 truncate text-sm font-medium text-oz-text">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </GlassPanel>
  );
}
