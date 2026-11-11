'use client';

import { DetailPanel } from '@oz/ui';
import { useState, type ReactNode } from 'react';

export interface ProfileSection {
  /** Identifiant stable : `data-testid="profile-section-{id}"`. */
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: ReactNode;
  /** Contenu du panneau, rendu par le serveur. */
  readonly content: ReactNode;
}

/**
 * Sections d'une fiche (lot 1.5dc) : chaque carte est un bouton qui ouvre sa section dans un volet ;
 * Échap, la croix ou un clic à côté le referment et rendent le focus à la carte. Le contenu vient du
 * serveur : ce composant ne détient que l'état d'ouverture.
 */
export function ProfileSections({
  sections,
  openLabel,
  closeLabel,
}: {
  sections: readonly ProfileSection[];
  openLabel: string;
  closeLabel: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const current = sections.find((section) => section.id === openId);
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              aria-haspopup="dialog"
              data-testid={`profile-section-${section.id}`}
              onClick={() => {
                setOpenId(section.id);
              }}
              className="group flex min-h-20 w-full items-center gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-4 text-left transition-[border-color,background-color] duration-200 hover:border-oz-primary/40 hover:bg-oz-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oz-primary-bright"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-oz-primary/8 text-oz-primary [&>svg]:size-5"
              >
                {section.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-medium text-oz-text">
                  {section.title}
                </span>
                <span className="block truncate text-sm text-oz-text-muted">{section.summary}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-oz-primary">{openLabel}</span>
            </button>
          </li>
        ))}
      </ul>
      <DetailPanel
        open={current !== undefined}
        onClose={() => {
          setOpenId(null);
        }}
        title={current?.title ?? ''}
        description={current?.summary}
        closeLabel={closeLabel}
        testId="profile-panel"
      >
        {current?.content}
      </DetailPanel>
    </>
  );
}
