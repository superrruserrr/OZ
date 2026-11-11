'use client';

import * as Toast from '@radix-ui/react-toast';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type NotificationTone = 'success' | 'info' | 'error';

export interface NotificationProviderProps {
  /** Nom de la région des notifications, déjà traduit (Radix utilise un libellé anglais sinon). */
  label: string;
  /** Durée d'affichage par défaut en millisecondes. */
  duration?: number;
  children: ReactNode;
}

/** Fournit la région des notifications, en bas de l'écran, au-dessus du contenu. */
export function NotificationProvider({
  label,
  duration = 6000,
  children,
}: NotificationProviderProps) {
  return (
    <Toast.Provider label={label} duration={duration} swipeDirection="down">
      {children}
      <Toast.Viewport
        label={label}
        className="fixed inset-x-0 bottom-0 z-50 m-0 mx-auto flex w-full max-w-md list-none flex-col gap-3 p-4 outline-none"
      />
    </Toast.Provider>
  );
}

const notificationVariants = cva(
  [
    'relative flex items-start gap-3 rounded-[14px] border bg-oz-surface-1 p-4 pr-12 text-oz-text',
    'transition-[opacity,translate] duration-200 starting:translate-y-2 starting:opacity-0',
    'data-[state=closed]:opacity-0 motion-reduce:transition-none',
  ],
  {
    variants: {
      tone: {
        success: 'border-oz-primary/40',
        info: 'border-oz-legal-border',
        error: 'border-oz-danger/40',
      },
    },
  },
);

const dotClass: Record<NotificationTone, string> = {
  success: 'bg-oz-primary',
  info: 'bg-oz-legal-icon',
  error: 'bg-oz-danger',
};

export interface NotificationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone: NotificationTone;
  title: string;
  description?: string;
  /** Nom accessible du bouton de fermeture. */
  closeLabel: string;
  /** Durée propre à cette notification, en millisecondes. */
  duration?: number;
  className?: string;
}

/**
 * Notification (Radix Toast). Une erreur est annoncée tout de suite (`assertive`, type
 * `foreground`) ; un succès ou une information attend la fin de l'annonce en cours (`polite`).
 */
export function Notification({
  open,
  onOpenChange,
  tone,
  title,
  description,
  closeLabel,
  duration,
  className,
}: NotificationProps) {
  return (
    <Toast.Root
      open={open}
      onOpenChange={onOpenChange}
      type={tone === 'error' ? 'foreground' : 'background'}
      data-testid={`notification-${tone}`}
      data-tone={tone}
      {...(duration === undefined ? {} : { duration })}
      className={cn(notificationVariants({ tone }), className)}
    >
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', dotClass[tone])}
      />
      <div className="flex flex-col gap-1">
        <Toast.Title className="text-sm font-medium">{title}</Toast.Title>
        {description ? (
          <Toast.Description className="text-sm text-oz-text-muted">
            {description}
          </Toast.Description>
        ) : null}
      </div>
      <Toast.Close
        aria-label={closeLabel}
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-oz-text-muted outline-[1.5px] outline-transparent outline-solid hover:text-oz-text focus-visible:outline-oz-primary"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
          <path
            d="m4 4 8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </Toast.Close>
    </Toast.Root>
  );
}
