import type { ComponentType, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import type { CardLinkProps } from './value-card.js';

/** Couleur de rôle (design.md §8.4 n° 5) : vert pour les rôles du réseau, bleu pour le tuteur. */
const TONES = {
  player: 'bg-oz-tint-green text-oz-primary',
  organization: 'bg-oz-tint-green text-oz-primary',
  recruiter: 'bg-oz-tint-green text-oz-primary',
  guardian: 'bg-oz-legal-bg text-oz-legal-icon',
} as const;

export type RoleCardTone = keyof typeof TONES;

export interface RoleCardProps {
  href: string;
  /** « Je suis joueur » : nom du lien. */
  title: string;
  /** « Mon OZ ID vérifié » : description du lien. */
  subtitle: string;
  tone?: RoleCardTone | undefined;
  icon?: ReactNode | undefined;
  linkComponent?: ComponentType<CardLinkProps> | undefined;
  className?: string | undefined;
}

/*
 * Carte de rôle (lot 1.5ca) d'après le panneau « I am a player / club / scout » de la maquette :
 * une ligne cliquable — icône, rôle, sous-titre, flèche — à empiler dans un panneau d'appel. Lien
 * étiré : le rôle est le seul lien (nom = texte visible) et couvre toute la ligne. Commodité seulement : les droits restent appliqués par le serveur.
 */
export function RoleCard({
  href,
  title,
  subtitle,
  tone = 'player',
  icon,
  linkComponent,
  className,
}: RoleCardProps) {
  const Link = linkComponent ?? ('a' as unknown as ComponentType<CardLinkProps>);
  return (
    <div
      data-testid={`role-card-${tone}`}
      className={cn(
        'group relative flex min-h-16 min-w-0 items-center gap-4 rounded-xl border border-oz-border bg-oz-surface-1 px-4 py-3',
        'transition-[border-color,background-color] duration-200 hover:border-oz-primary/40 hover:bg-oz-surface-2',
        'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-oz-primary-bright',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-lg [&>svg]:size-5',
          TONES[tone],
        )}
      >
        {icon ?? <span className="size-2 rounded-full bg-current" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Link
          href={href}
          className="truncate font-semibold text-oz-text outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
        >
          {title}
        </Link>
        <span className="truncate text-sm text-oz-text-muted">{subtitle}</span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="size-4 shrink-0 text-oz-text-muted transition-transform duration-200 group-hover:text-oz-primary motion-safe:group-hover:translate-x-0.5"
      >
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    </div>
  );
}
