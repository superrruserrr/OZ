import { cn } from '../lib/cn.js';

export interface DotPaginationProps {
  count: number;
  /** Index courant, à partir de 0. */
  index: number;
  /** Libellé déjà traduit de chaque point (« Volet 2 sur 4 »). */
  label: (position: number, total: number) => string;
  /** Points cliquables ; sans lui, indicateur seul avec la position en texte. */
  onSelect?: ((index: number) => void) | undefined;
  /** Points `{testId}-{n}`. */
  testId?: string | undefined;
  className?: string | undefined;
}

/*
 * Pagination à points (écran 01, design.md §8.6, E15) : le point actif s'étire en pilule de 8 à
 * 20 px en 250 ms, par `transform: scaleX` dans une case de 20 px (GPU, sans décalage) ; il saute
 * avec mouvement réduit.
 */
export function DotPagination({
  count,
  index,
  label,
  onSelect,
  testId = 'dot',
  className,
}: DotPaginationProps) {
  const total = Math.max(0, Math.floor(count));
  const dot = (active: boolean) => (
    <span
      aria-hidden="true"
      className={cn(
        'block size-2 rounded-full transition-[transform,background-color] duration-250',
        active ? 'scale-x-250 bg-oz-primary' : 'bg-oz-border',
      )}
    />
  );
  if (!onSelect) {
    return (
      <div className={cn('flex items-center', className)}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="grid h-6 w-7 place-items-center">
            {dot(i === index)}
          </span>
        ))}
        <span className="sr-only">{label(index + 1, total)}</span>
      </div>
    );
  }
  return (
    <div className={cn('flex items-center', className)}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={label(i + 1, total)}
          {...(i === index ? { 'aria-current': 'step' as const } : {})}
          data-testid={`${testId}-${String(i + 1)}`}
          onClick={() => {
            onSelect(i);
          }}
          className="grid size-11 place-items-center"
        >
          {dot(i === index)}
        </button>
      ))}
    </div>
  );
}
