'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  /** Titre du panneau, déjà traduit : nom du dialogue. */
  title: string;
  /** Sous-titre facultatif. */
  description?: string | undefined;
  closeLabel: string;
  children: ReactNode;
  testId?: string | undefined;
  className?: string | undefined;
}

/*
 * Panneau de détail (lot 1.5dc) : une section de fiche s'ouvre au clic dans un volet latéral (plein
 * écran sous 640 px), sans quitter la page. Radix Dialog : focus piégé, Échap et clic hors du volet
 * le ferment, le focus revient au déclencheur. Animation en opacité et transform, coupée sous
 * mouvement réduit.
 */
export function DetailPanel({
  open,
  onClose,
  title,
  description,
  closeLabel,
  children,
  testId = 'detail-panel',
  className,
}: DetailPanelProps) {
  // Radix ne rend le focus qu'à un `Dialog.Trigger` : le panneau étant piloté par `open`, on
  // mémorise l'élément actif à l'ouverture pour le lui rendre à la fermeture.
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-oz-bg/70 motion-safe:animate-oz-fade-in" />
        <Dialog.Content
          data-testid={testId}
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col gap-5 overflow-y-auto border-l border-oz-border bg-oz-surface-1 p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl outline-none motion-safe:animate-oz-slide-in sm:max-w-md sm:p-6',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-xl font-medium text-oz-text">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-oz-text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label={closeLabel}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-oz-border text-oz-text hover:border-oz-primary/40"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" />
              </svg>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
