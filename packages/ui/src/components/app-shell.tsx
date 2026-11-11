import type { ComponentType, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Kicker } from './sport.js';
import { TabBar, type NavLinkProps, type TabItem } from './tab-bar.js';

export interface AppShellNavSection {
  /** Libellé de section du rail, déjà traduit (« Réseau »). */
  label: string;
  items: readonly TabItem[];
}

export interface AppShellNav {
  /** Nom de la navigation, déjà traduit. */
  label: string;
  /** Entrées principales : rail et barre d'onglets (cinq au plus). */
  items: readonly TabItem[];
  activeId: string;
  /** Libellé de la section principale du rail (« Pilotage »). */
  sectionLabel?: string | undefined;
  /** Section secondaire, au rail seulement (favoris, réglages, aide). */
  secondary?: AppShellNavSection | undefined;
  countLabel?: ((count: number) => string) | undefined;
  linkComponent?: ComponentType<NavLinkProps> | undefined;
}

export interface AppShellProps {
  /** Libellé déjà traduit du lien d'évitement (« Aller au contenu »). */
  skipLabel: string;
  /** Contenu de l'en-tête (logo, langue, compte). */
  header: ReactNode;
  /** Fil d'Ariane affiché dans l'en-tête (≥ 640 px). */
  breadcrumb?: ReactNode | undefined;
  /** Navigation par rôle ; sans elle, page sans onglets (inscription, pages publiques). */
  nav?: AppShellNav | undefined;
  /** Bas du rail (profil, état du réseau) ; large écran seulement. */
  railFooter?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}

function RailLink({
  item,
  active,
  countLabel,
  Link,
}: {
  item: TabItem;
  active: boolean;
  countLabel: AppShellNav['countLabel'];
  Link: ComponentType<NavLinkProps>;
}) {
  const count = item.count && item.count > 0 ? item.count : 0;
  return (
    <Link
      href={item.href}
      data-testid={`rail-${item.id}`}
      {...(active ? { 'aria-current': 'page' as const } : {})}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors duration-150',
        active
          ? 'bg-oz-primary/10 text-oz-primary before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-oz-primary'
          : 'text-oz-text-muted hover:bg-oz-surface-2 hover:text-oz-text',
      )}
    >
      {item.icon ? (
        <span aria-hidden="true" className="[&>svg]:size-5">
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count && countLabel ? <span className="sr-only">, {countLabel(count)}</span> : null}
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
}

/*
 * Coquille applicative (lot 1.5bb, v2 lot 1.5ca, design.md §8.8) d'après la maquette Manus : en-tête
 * vitré collant avec fil d'Ariane, rail latéral à sections (≥ 1024 px), barre d'onglets en bas sur
 * téléphone et tablette. Une seule des deux navigations est affichée, donc exposée, à la fois.
 * Commodité seulement : les droits sont appliqués par le serveur (une route interdite renvoie 404).
 */
export function AppShell({
  skipLabel,
  header,
  breadcrumb,
  nav,
  railFooter,
  children,
  className,
}: AppShellProps) {
  const Link = nav?.linkComponent ?? ('a' as unknown as ComponentType<NavLinkProps>);
  return (
    <div className={cn('flex min-h-dvh flex-col bg-oz-bg text-oz-text', className)}>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-oz-surface-2 focus:px-4"
      >
        {skipLabel}
      </a>
      <header className="sticky top-0 z-20 border-b border-oz-border bg-oz-bg supports-backdrop-filter:bg-oz-bg/80 supports-backdrop-filter:backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          {header}
          {breadcrumb ? (
            <div
              data-testid="app-shell-breadcrumb"
              className="mr-auto hidden min-w-0 truncate text-sm text-oz-text-muted sm:block"
            >
              {breadcrumb}
            </div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {nav ? (
          <nav
            aria-label={nav.label}
            data-testid="app-shell-rail"
            className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-62 shrink-0 flex-col gap-1 overflow-y-auto border-r border-oz-border bg-oz-surface-1/40 px-3 py-5 lg:flex"
          >
            {nav.sectionLabel ? <Kicker className="mb-2 px-3">{nav.sectionLabel}</Kicker> : null}
            {nav.items.map((item) => (
              <RailLink
                key={item.id}
                item={item}
                active={item.id === nav.activeId}
                countLabel={nav.countLabel}
                Link={Link}
              />
            ))}
            {nav.secondary ? (
              <>
                <Kicker tone="highlight" className="mt-6 mb-2 px-3">
                  {nav.secondary.label}
                </Kicker>
                {nav.secondary.items.map((item) => (
                  <RailLink
                    key={item.id}
                    item={item}
                    active={item.id === nav.activeId}
                    countLabel={nav.countLabel}
                    Link={Link}
                  />
                ))}
              </>
            ) : null}
            {railFooter ? (
              <div className="mt-auto border-t border-oz-border pt-4">{railFooter}</div>
            ) : null}
          </nav>
        ) : null}
        <main
          id="contenu"
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:py-8',
            nav && 'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8',
          )}
        >
          {children}
        </main>
      </div>
      {nav ? (
        <div data-testid="app-shell-tabs" className="fixed inset-x-0 bottom-0 z-20 lg:hidden">
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
