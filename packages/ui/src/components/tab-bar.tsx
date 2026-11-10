import type { ComponentType, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export const TAB_BAR_MAX = 5;

export interface TabItem {
  /** Identifiant stable ; `data-testid="tab-{id}"`. */
  id: string;
  label: string;
  href: string;
  icon?: ReactNode | undefined;
  /** Pastille de compteur (non lus), plafonnée à « 99+ ». */
  count?: number | undefined;
}

interface LinkProps {
  href: string;
  className?: string | undefined;
  children?: ReactNode | undefined;
  'aria-current'?: 'page';
  'data-testid'?: string;
}

export interface TabBarProps {
  /** Nom de la navigation, déjà traduit. */
  label: string;
  items: readonly TabItem[];
  activeId: string;
  /** Texte du compteur lu après le libellé (« 3 non lus ») ; la pastille seule n'est pas lue. */
  countLabel?: ((count: number) => string) | undefined;
  /** Lien du routeur de l'application (`next/link`) ; `<a>` par défaut. */
  linkComponent?: ComponentType<LinkProps> | undefined;
  className?: string | undefined;
}

/*
 * Barre d'onglets (design.md §8.6, §8.8) : cinq onglets au plus, icône et libellé, actif en vert
 * (`aria-current="page"`), pastille rouge de notification. Sans routage : l'application fournit
 * les liens et le composant de lien ; les garde-fous des routes restent côté serveur.
 */
export function TabBar({
  label,
  items,
  activeId,
  countLabel,
  linkComponent: Link = 'a' as unknown as ComponentType<LinkProps>,
  className,
}: TabBarProps) {
  if (items.length > TAB_BAR_MAX) {
    throw new RangeError(
      `TabBar : ${String(items.length)} onglets, ${String(TAB_BAR_MAX)} au plus`,
    );
  }
  return (
    <nav
      aria-label={label}
      className={cn('w-full border-t border-oz-border bg-oz-surface-1', className)}
    >
      <ul className="flex">
        {items.map((item) => {
          const active = item.id === activeId;
          const count = item.count && item.count > 0 ? item.count : 0;
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <Link
                href={item.href}
                data-testid={`tab-${item.id}`}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold',
                  active ? 'text-oz-primary' : 'text-oz-text-muted',
                )}
              >
                {item.icon ? (
                  <span aria-hidden="true" className="[&>svg]:size-6">
                    {item.icon}
                  </span>
                ) : null}
                <span className="max-w-full truncate">{item.label}</span>
                {count && countLabel ? (
                  <span className="sr-only">, {countLabel(count)}</span>
                ) : null}
                {count ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 left-1/2 ml-2 min-w-5 rounded-full bg-oz-danger px-1 text-center text-[11px] leading-5 text-oz-bg"
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
