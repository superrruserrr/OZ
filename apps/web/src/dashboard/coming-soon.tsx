import { Badge } from '@oz/ui';
import type { ReactNode } from 'react';

export interface ComingSoonItem {
  key: string;
  title: string;
  text: string;
  icon: ReactNode;
}

/*
 * Fonctions pas encore livrées (lot 1.5ec, E3) : cartes désactivées, sans lien ni chiffre, avec le
 * badge « Bientôt disponible ». Elles seront remplies par leurs lots (1.19, Phase 2).
 */
export function ComingSoonGrid({
  title,
  badge,
  items,
}: {
  title: string;
  badge: string;
  items: readonly ComingSoonItem[];
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3" data-testid="coming-soon">
      <h2 className="font-display text-lg font-medium text-oz-text">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.key}
            aria-disabled="true"
            data-testid={`coming-soon-${item.key}`}
            className="flex cursor-not-allowed flex-col gap-2 rounded-2xl border border-dashed border-oz-border bg-oz-surface-1/60 p-4 text-oz-text-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span aria-hidden="true" className="text-oz-text-label [&_svg]:size-5">
                {item.icon}
              </span>
              <Badge tone="neutral" filled>
                {badge}
              </Badge>
            </div>
            <h3 className="text-sm font-medium text-oz-text">{item.title}</h3>
            <p className="text-sm">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
