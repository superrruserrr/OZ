import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

const TONES = {
  info: 'border-oz-border bg-oz-surface-2 text-oz-text-muted [&_strong]:text-oz-text',
  legal: 'border-oz-legal-border bg-oz-legal-bg text-oz-legal-text [&_strong]:text-oz-legal-text',
};

export interface CalloutProps {
  /** `legal` : tout ce qui relève du tuteur et du cadre légal est bleu (design.md §8.4 n° 2). */
  tone?: keyof typeof TONES | undefined;
  title?: string | undefined;
  icon?: ReactNode | undefined;
  children: ReactNode;
  /** `false` : rien n'est rendu ; passer à `true` déplie l'encadré (E6, 250 ms). */
  open?: boolean | undefined;
  /** Région `aria-live="polite"` rendue même fermée, pour annoncer l'apparition (bloc mineur). */
  live?: boolean | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

/*
 * Encadré d'information (design.md §8.6, écrans 03-06) : contour fin, icône à gauche, texte atténué
 * avec passages en gras. E6 : apparition par opacité et transform en 250 ms, directe avec
 * mouvement réduit.
 */
export function Callout({
  tone = 'info',
  title,
  icon,
  children,
  open = true,
  live = false,
  testId = 'callout',
  className,
}: CalloutProps) {
  const box = open ? (
    <div
      data-testid={testId}
      data-tone={tone}
      className={cn(
        'flex origin-top animate-oz-unfold gap-3 rounded-[14px] border p-4 text-sm',
        TONES[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&>svg]:size-5">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  ) : null;
  if (!live) return box;
  return (
    <div aria-live="polite" data-testid={`${testId}-region`}>
      {box}
    </div>
  );
}
