'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import type { NavLinkProps } from './tab-bar.js';

export interface SiteTopbarLink {
  /** Identifiant stable : `data-testid="site-nav-{id}"`. */
  id: string;
  href: string;
  label: string;
}

export interface SiteTopbarProps {
  /** Logo cliquable vers l'accueil. */
  brand: ReactNode;
  /** Nom de la navigation, déjà traduit. */
  navLabel: string;
  links: readonly SiteTopbarLink[];
  /** Lien actif (`aria-current="page"`). */
  activeId?: string | undefined;
  /** Actions de droite (connexion, création de compte, langue), reprises dans le menu mobile. */
  actions: ReactNode;
  /** Libellé du bouton de menu et titre de la feuille (« Menu »). */
  menuLabel: string;
  closeLabel: string;
  /** Lien du routeur de l'application (`next/link`) ; `<a>` par défaut. */
  linkComponent?: ComponentType<NavLinkProps> | undefined;
  className?: string | undefined;
}

/*
 * En-tête du site public (lot 1.5ca, ADR-011) d'après la topbar de la maquette Manus : vitré et
 * collant, logo, navigation centrale (≥ 640 px), actions à droite. Sous 640 px, un bouton ouvre une
 * feuille plein écran (Radix Dialog : focus piégé, Échap, focus rendu au bouton) qui se ferme dès
 * qu'un lien est choisi.
 */
export function SiteTopbar({
  brand,
  navLabel,
  links,
  activeId,
  actions,
  menuLabel,
  closeLabel,
  linkComponent,
  className,
}: SiteTopbarProps) {
  const Link = linkComponent ?? ('a' as unknown as ComponentType<NavLinkProps>);
  const [open, setOpen] = useState(false);
  const closeOnLink = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };
  const linkClass = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-150',
      active ? 'text-oz-text' : 'text-oz-text-muted hover:text-oz-text',
    );
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-oz-border bg-oz-bg supports-backdrop-filter:bg-oz-bg/75 supports-backdrop-filter:backdrop-blur-md',
        className,
      )}
    >
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <div className="shrink-0">{brand}</div>
        <nav aria-label={navLabel} className="mx-auto max-sm:hidden">
          <ul className="flex gap-1">
            {links.map((link) => (
              <li key={link.id}>
                <Link
                  href={link.href}
                  data-testid={`site-nav-${link.id}`}
                  {...(link.id === activeId ? { 'aria-current': 'page' as const } : {})}
                  className={linkClass(link.id === activeId)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 max-sm:hidden sm:ml-0">{actions}</div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger
            aria-label={menuLabel}
            data-testid="site-menu-button"
            className="ml-auto grid size-11 place-items-center rounded-xl border border-oz-border text-oz-text sm:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.75" />
            </svg>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-oz-bg/80 sm:hidden" />
            <Dialog.Content
              aria-describedby={undefined}
              onClick={closeOnLink}
              data-testid="site-menu-sheet"
              className="fixed inset-0 z-50 flex flex-col gap-6 overflow-y-auto bg-oz-bg px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] motion-safe:animate-oz-fade-in sm:hidden"
            >
              <div className="flex min-h-14 items-center justify-between gap-3">
                <div className="shrink-0">{brand}</div>
                <Dialog.Title className="sr-only">{menuLabel}</Dialog.Title>
                <Dialog.Close
                  aria-label={closeLabel}
                  className="grid size-11 place-items-center rounded-xl border border-oz-border text-oz-text"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                </Dialog.Close>
              </div>
              <nav aria-label={navLabel}>
                <ul className="flex flex-col border-y border-oz-border">
                  {links.map((link) => (
                    <li key={link.id} className="border-b border-oz-border last:border-b-0">
                      <Link
                        href={link.href}
                        {...(link.id === activeId ? { 'aria-current': 'page' as const } : {})}
                        className="flex min-h-14 items-center justify-between font-display text-xl font-medium text-oz-text"
                      >
                        {link.label}
                        <span aria-hidden="true" className="text-oz-primary">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="flex flex-col items-stretch gap-3">{actions}</div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
