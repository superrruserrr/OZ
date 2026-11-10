'use client';

import { Callout, StepProgress } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { LogoutButton } from '../auth/logout-button';
import { useRouter } from '../i18n/navigation';
import type { SignupFailure } from './actions';
import { ONBOARDING_PATH } from './steps';

export interface StepShellProps {
  readonly step: number;
  readonly total: number;
  readonly title: string;
  readonly lead: string;
  /** Étape précédente ; le bouton retour n'apparaît qu'avec elle. */
  readonly backPath: string | null;
  /** Date de fin de conservation du brouillon, déjà formatée. */
  readonly resumeUntil?: string | null | undefined;
  readonly testId: string;
  readonly children: ReactNode;
}

/** Cadre d'une étape : progression (E7), titre et retour vers l'étape précédente. */
export function StepShell({
  step,
  total,
  title,
  lead,
  backPath,
  resumeUntil,
  testId,
  children,
}: StepShellProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  return (
    <section className="flex flex-col gap-6" data-testid={testId}>
      <StepProgress
        step={step}
        total={total}
        label={t('progress', { step, total })}
        testId="onboarding-progress"
        {...(backPath === null
          ? {}
          : {
              backLabel: t('back'),
              onBack: () => {
                router.push(backPath);
              },
            })}
      />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="text-oz-text-muted">{lead}</p>
        {resumeUntil ? (
          <p className="text-sm text-oz-text-muted" data-testid="onboarding-resume">
            {t('resume', { date: resumeUntil })}
          </p>
        ) : null}
      </div>
      {children}
      <div className="flex justify-center border-t border-oz-border pt-4">
        <LogoutButton />
      </div>
    </section>
  );
}

/** Erreur générale d'une étape, annoncée (`aria-live`) ; jamais un message de l'API. */
export function StepError({ failure }: { readonly failure: SignupFailure | null }) {
  const t = useTranslations('onboarding.errors');
  const text =
    failure === null
      ? null
      : failure.error === 'retryLater' && failure.retryAfterSeconds !== undefined
        ? t('retryAfter', { seconds: failure.retryAfterSeconds })
        : t(failure.error);
  return (
    <div aria-live="polite">
      {text ? <Callout testId="onboarding-error">{text}</Callout> : null}
    </div>
  );
}

/**
 * Appel d'une action serveur depuis le navigateur : une coupure réseau ou une réponse illisible
 * (renvoi du proxy vers la connexion) devient une panne affichée, jamais un bouton bloqué.
 */
export async function callAction<T>(action: () => Promise<T>): Promise<T | SignupFailure> {
  try {
    return await action();
  } catch {
    return { ok: false, error: 'unavailable', fields: {} };
  }
}

/**
 * Suite d'un enregistrement : étape suivante, ou rechargement quand la session a expiré
 * (`proxy.ts` renouvelle ou renvoie à la connexion), ou écran final si l'inscription est déjà faite.
 */
export function useStepResult(): {
  readonly failure: SignupFailure | null;
  readonly settle: (result: { ok: true; next: string } | SignupFailure) => void;
  /** Efface l'erreur précédente avant un nouvel envoi (erreur de champ de l'API corrigée). */
  readonly clear: () => void;
} {
  const router = useRouter();
  const [failure, setFailure] = useState<SignupFailure | null>(null);
  const settle = (result: { ok: true; next: string } | SignupFailure): void => {
    if (result.ok) {
      setFailure(null);
      router.push(result.next);
      return;
    }
    if (result.error === 'session') {
      window.location.reload();
      return;
    }
    if (result.error === 'completed') {
      router.replace(ONBOARDING_PATH);
      return;
    }
    setFailure(result);
  };
  return {
    failure,
    settle,
    clear: () => {
      setFailure(null);
    },
  };
}
