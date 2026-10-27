import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

const surface = 'rounded-[14px] border border-oz-border bg-oz-surface-2 p-5 text-oz-text';

interface StaticCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: false;
}

interface InteractiveCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  /** Carte choisissable (rôle, palier) : bouton à bascule, sélection annoncée par `aria-pressed`. */
  interactive: true;
  selected?: boolean;
  onSelect?: () => void;
}

export type CardProps = StaticCardProps | InteractiveCardProps;

function SelectedMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-4 right-4 grid size-6 place-items-center rounded-full bg-oz-primary text-oz-on-primary opacity-0 transition-opacity duration-150 group-data-[state=selected]:opacity-100"
    >
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
        <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Retire le discriminant `interactive`, qui n'est pas un attribut HTML. */
function domProps<T extends { interactive?: boolean }>(props: T): Omit<T, 'interactive'> {
  const copy = { ...props };
  Reflect.deleteProperty(copy, 'interactive');
  return copy;
}

/** Carte (design.md §8.6) : surface `surface-2`, rayon 14 px ; sélectionnée = contour vert et pastille. */
export function Card(props: CardProps) {
  if (!props.interactive) {
    const { className, ...rest } = domProps(props);
    return <div {...rest} className={cn(surface, className)} />;
  }
  const {
    selected = false,
    onSelect,
    onClick,
    className,
    children,
    type,
    ...rest
  } = domProps(props);
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      aria-pressed={selected}
      data-state={selected ? 'selected' : 'idle'}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect?.();
      }}
      className={cn(
        surface,
        'group relative block w-full pr-14 text-left outline-[1.5px] outline-offset-0 outline-transparent outline-solid',
        'transition-[outline-color,border-color] duration-150 hover:border-oz-text-disabled',
        'focus-visible:outline-oz-primary data-[state=selected]:border-oz-primary',
        'disabled:cursor-not-allowed disabled:text-oz-text-disabled disabled:hover:border-oz-border',
        className,
      )}
    >
      {children}
      <SelectedMark />
    </button>
  );
}
