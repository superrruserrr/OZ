import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState, type SubmitEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Button } from './button.js';

/** Valeurs textuelles du formulaire de la modale ; la validation (Zod) reste à l'appelant. */
export type ModalValues = Record<string, string>;

/*
 * Props imposées par naming_conventions.md (`open`, `onClose`, `onSubmit`, `title`) ; tous les textes
 * arrivent déjà traduits (décision D5 du lot 0.10).
 */
/** Avec `onSubmit`, le libellé du bouton et le message d'échec sont obligatoires : aucun échec muet. */
type ModalSubmitProps =
  | {
      /** Soumission : la modale se ferme au succès, reste ouverte et affiche l'erreur au rejet. */
      onSubmit: (values: ModalValues) => Promise<void>;
      submitLabel: string;
      /** Message affiché quand `onSubmit` est rejeté ; le détail technique n'est jamais montré. */
      submitErrorMessage: string;
    }
  | { onSubmit?: undefined; submitLabel?: undefined; submitErrorMessage?: undefined };

export type ModalProps = ModalSubmitProps & {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Identifiant kebab-case : `data-testid="modal-{name}"` et `modal-{name}-submit`. */
  name: string;
  description?: string;
  /** Erreur fournie par l'appelant (par exemple après validation serveur). */
  error?: string | null;
  cancelLabel: string;
  /** Nom accessible de la croix de fermeture. */
  closeLabel: string;
  children?: ReactNode;
  className?: string;
};

function formValues(form: HTMLFormElement): ModalValues {
  const values: ModalValues = {};
  for (const [key, value] of new FormData(form)) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

/** Modale (Radix Dialog) : piège du focus, Échap, clic extérieur, retour du focus au déclencheur. */
export function Modal({
  open,
  onClose,
  onSubmit,
  title,
  name,
  description,
  error = null,
  submitErrorMessage,
  submitLabel,
  cancelLabel,
  closeLabel,
  children,
  className,
}: ModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  // Radix ne rend le focus qu'à un `Dialog.Trigger` : la modale étant pilotée par `open`, on
  // retient l'élément actif à l'ouverture pour y revenir à la fermeture.
  const returnFocus = useRef<HTMLElement | null>(null);
  const shownError = error ?? (failed ? submitErrorMessage : null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSubmit || submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await onSubmit(formValues(event.currentTarget));
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFailed(false);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-oz-bg/80 transition-opacity duration-200 starting:opacity-0" />
        <Dialog.Content
          data-testid={`modal-${name}`}
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
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg',
            '-translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-[18px]',
            'border border-oz-border bg-oz-surface-1 p-6 text-oz-text',
            'transition-[opacity,scale] duration-200 starting:scale-95 starting:opacity-0',
            'motion-reduce:transition-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Dialog.Title className="font-display text-xl font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-oz-text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label={closeLabel}
              className="grid size-9 shrink-0 place-items-center rounded-full text-oz-text-muted outline-[1.5px] outline-transparent outline-solid transition-colors hover:text-oz-text focus-visible:outline-oz-primary"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                <path
                  d="m4 4 8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </div>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            {children}
            {shownError ? (
              <p role="alert" className="text-sm text-oz-danger">
                {shownError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button variant="secondary" size="sm">
                  {cancelLabel}
                </Button>
              </Dialog.Close>
              {onSubmit ? (
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  data-testid={`modal-${name}-submit`}
                >
                  {submitLabel}
                </Button>
              ) : null}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
