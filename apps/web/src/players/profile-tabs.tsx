'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface ProfileSection {
  /** Identifiant stable : `data-testid="profile-section-{id}"`, valeur de `?section=`. */
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: ReactNode;
  /** Contenu de l'onglet, rendu par le serveur. */
  readonly content: ReactNode;
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Sections d'une fiche (lot 1.19ch) : onglets en place, plus de volet latéral. Motif « tabs » de
 * l'APG à activation automatique : ←/→ circulaires, Début/Fin, un seul onglet dans l'ordre de
 * tabulation. La section ouverte est dans l'URL (`?section=`, sans rechargement) pour être partagée.
 * Entrée du contenu : fondu et léger glissement de 180 ms, aucun sous `prefers-reduced-motion`.
 */
export function ProfileTabs({
  sections,
  label,
  initialId,
}: {
  readonly sections: readonly ProfileSection[];
  readonly label: string;
  readonly initialId?: string | undefined;
}) {
  const base = useId();
  const [currentId, setCurrentId] = useState(
    sections.some((section) => section.id === initialId) ? initialId : sections[0]?.id,
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const current = sections.find((section) => section.id === currentId) ?? sections[0];

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reducedMotion() || typeof panel.current?.animate !== 'function') return;
    panel.current.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  }, [currentId]);

  if (current === undefined) return null;

  const select = (index: number, focus: boolean) => {
    const target = sections[(index + sections.length) % sections.length];
    if (target === undefined) return;
    setCurrentId(target.id);
    const url = new URL(window.location.href);
    url.searchParams.set('section', target.id);
    window.history.replaceState(window.history.state, '', url);
    if (focus) tabs.current[(index + sections.length) % sections.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = sections.findIndex((section) => section.id === current.id);
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: sections.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
      >
        {sections.map((section, index) => {
          const selected = section.id === current.id;
          return (
            <button
              key={section.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${section.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              data-testid={`profile-section-${section.id}`}
              onClick={() => {
                select(index, false);
              }}
              className={`flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[border-color,background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oz-primary-bright [&_svg]:size-4 ${
                selected
                  ? 'border-oz-primary bg-oz-primary text-oz-on-primary'
                  : 'border-oz-border bg-oz-surface-1 text-oz-text-muted hover:border-oz-primary/40 hover:text-oz-text'
              }`}
            >
              <span aria-hidden="true">{section.icon}</span>
              {section.title}
            </button>
          );
        })}
      </div>
      <div
        ref={panel}
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${current.id}`}
        tabIndex={0}
        data-testid="profile-panel"
        className="flex flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oz-primary-bright sm:p-6"
      >
        <p className="text-sm text-oz-text-muted">{current.summary}</p>
        {current.content}
      </div>
    </div>
  );
}
