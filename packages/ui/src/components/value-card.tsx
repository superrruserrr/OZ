import type { ComponentType, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { IconTile } from './icon-tile.js';
import type { NavLinkProps } from './tab-bar.js';

export type CardLinkProps = NavLinkProps;

export interface ValueCardProps {
  href: string;
  /** Titre déjà traduit : texte et nom du lien. */
  title: string;
  /** Niveau du titre dans la page. */
  titleAs?: 'h2' | 'h3' | undefined;
  /** Texte d'appui : description du lien. */
  children: ReactNode;
  /** Libellé visuel du bas de carte (« Découvrir »), redondant pour les lecteurs d'écran. */
  cta: string;
  icon?: ReactNode | undefined;
  /** Lien du routeur de l'application (`next/link`) ; `<a>` par défaut. */
  linkComponent?: ComponentType<CardLinkProps> | undefined;
  className?: string | undefined;
}

/*
 * Carte de valeur (lot 1.5ca) d'après le bandeau « Discover / Connect / Accelerate » de la maquette
 * Manus : tuile d'icône, titre, texte, lien bas à flèche. Motif du lien étiré : le titre est
 * le seul lien (nom = texte visible, WCAG 2.5.3) et son `::after` couvre toute la carte ; survol :
 * bordure verte et légère montée (motion-safe), focus visible sur la carte entière.
 */
export function ValueCard({
  href,
  title,
  titleAs: Title = 'h3',
  children,
  cta,
  icon,
  linkComponent,
  className,
}: ValueCardProps) {
  const Link = linkComponent ?? ('a' as unknown as ComponentType<CardLinkProps>);
  return (
    <article
      data-testid="value-card"
      className={cn(
        'group relative flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-6',
        'transition-[transform,border-color,background-color] duration-200',
        'hover:border-oz-primary/40 hover:bg-oz-surface-2 motion-safe:hover:-translate-y-0.5',
        'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-oz-primary-bright',
        className,
      )}
    >
      {icon ? <IconTile size="sm">{icon}</IconTile> : null}
      <Title className="font-display text-xl font-bold text-oz-text">
        <Link
          href={href}
          className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
        >
          {title}
        </Link>
      </Title>
      <p className="text-sm leading-relaxed text-oz-text-muted">{children}</p>
      <span
        aria-hidden="true"
        className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-oz-primary"
      >
        {cta}
        <svg
          viewBox="0 0 16 16"
          className="size-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
          fill="none"
        >
          <path d="M5 11 11 5M6 5h5v5" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </span>
    </article>
  );
}
