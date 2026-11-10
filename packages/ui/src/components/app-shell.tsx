import type { ComponentType, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { TabBar, type NavLinkProps, type TabItem } from './tab-bar.js';

export interface AppShellNav {
  /** Nom de la navigation, déjà traduit. */
  label: string;
  items: readonly TabItem[];
  activeId: string;
  countLabel?: ((count: number) => string) | undefined;
  linkComponent?: ComponentType<NavLinkProps> | undefined;
}

export interface AppShellProps {
  /** Libellé déjà traduit du lien d'évitement (« Aller au contenu »). */
  skipLabel: string;
  /** Contenu de l'en-tête (logo, langue, compte). */
  header: ReactNode;
  /** Navigation par rôle ; sans elle, page sans onglets (inscription, pages publiques). */
  nav?: AppShellNav | undefined;
  children: ReactNode;
  className?: string | undefined;
}

/*
 * Coquille applicative (lot 1.5bb, design.md §8.8) : en-tête, contenu principal et navigation par
 * rôle. Téléphone : barre d'onglets en bas ; large écran (≥ 1024 px) : rail latéral. Une seule des
 * deux navigations est affichée, donc exposée, à la fois. Commodité seulement : les droits sont
 * appliqués par le serveur (une route interdite renvoie 404).
 */
export function AppShell({ skipLabel, header, nav, children, className }: AppShellProps) {
  const Link = nav?.linkComponent ?? ('a' as unknown as ComponentType<NavLinkProps>);
  return (
    <div className={cn('flex min-h-dvh flex-col bg-oz-bg text-oz-text', className)}>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-20 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-oz-surface-2 focus:px-4"
      >
        {skipLabel}
      </a>
      <header className="sticky top-0 z-10 border-b border-oz-border bg-oz-bg">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
          {header}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1">
        {nav ? (
          <nav
            aria-label={nav.label}
            data-testid="app-shell-rail"
            className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col gap-1 border-r border-oz-border px-3 py-4 lg:flex"
          >
            {nav.items.map((item) => {
              const active = item.id === nav.activeId;
              const count = item.count && item.count > 0 ? item.count : 0;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-testid={`rail-${item.id}`}
                  {...(active ? { 'aria-current': 'page' as const } : {})}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold',
                    active ? 'bg-oz-tint-green text-oz-primary' : 'text-oz-text-muted',
                  )}
                >
                  {item.icon ? (
                    <span aria-hidden="true" className="[&>svg]:size-5">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {count && nav.countLabel ? (
                    <span className="sr-only">, {nav.countLabel(count)}</span>
                  ) : null}
                  {count ? (
                    <span
                      aria-hidden="true"
                      className="min-w-5 rounded-full bg-oz-danger px-1 text-center text-[11px] leading-5 text-oz-bg"
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        ) : null}
        <main
          id="contenu"
          tabIndex={-1}
          className={cn('min-w-0 flex-1 px-4 py-6 outline-none', nav && 'pb-20 lg:pb-6')}
        >
          {children}
        </main>
      </div>
      {nav ? (
        <div data-testid="app-shell-tabs" className="fixed inset-x-0 bottom-0 z-10 lg:hidden">
          <TabBar
            label={nav.label}
            items={nav.items}
            activeId={nav.activeId}
            countLabel={nav.countLabel}
            linkComponent={nav.linkComponent}
          />
        </div>
      ) : null}
    </div>
  );
}
