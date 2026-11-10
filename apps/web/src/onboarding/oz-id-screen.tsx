'use client';

import type { SignupCompleteOutput } from '@oz/contracts';
import { Badge, Button, Halo, OzIdCard } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Link, useRouter } from '../i18n/navigation';
import { completeSignup, type SignupFailure } from './actions';
import { callAction, StepError } from './step-shell';
import { ONBOARDING_PATH } from './steps';

export interface OzIdScreenProps {
  readonly name: string;
  /** Récapitulatif déjà traduit (libellé, valeur). */
  readonly summary: readonly { readonly label: string; readonly value: string }[];
  /** Détails de la carte (poste, pays), déjà traduits. */
  readonly details: readonly string[];
}

/**
 * Finalisation (EX-120) : un seul appel même sur un double clic, puis carte OZ ID révélée (E2) sur
 * son halo (E1). L'OZ ID, le statut et la complétude sont ceux rendus par l'API.
 */
export function OzIdScreen({ name, summary, details }: OzIdScreenProps) {
  const t = useTranslations('onboarding.ozId');
  const [card, setCard] = useState<SignupCompleteOutput | null>(null);
  const [failure, setFailure] = useState<SignupFailure | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const router = useRouter();

  const finalize = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    void callAction(completeSignup).then((result) => {
      inFlight.current = false;
      setPending(false);
      if (result.ok) {
        setFailure(null);
        setCard(result.card);
      } else if (result.error === 'session') {
        window.location.reload();
      } else if (result.error === 'incomplete' || result.error === 'completed') {
        // Étape manquante ou fiche déjà créée : l'aiguillage relit l'API et choisit l'écran.
        router.replace(ONBOARDING_PATH);
      } else {
        setFailure(result);
      }
    });
  };

  if (card !== null) {
    return (
      <div className="flex flex-col items-center gap-6" data-testid="onboarding-oz-id-ready">
        <h2 className="font-display text-2xl font-bold" aria-live="polite">
          {t('revealTitle')}
        </h2>
        <Halo className="w-full">
          <OzIdCard
            name={name}
            ozId={card.ozId}
            ozIdLabel={t('ozIdLabel')}
            details={details}
            reveal
            badge={
              <Badge tone="neutral" status="declared" confirmed>
                {t('declared')}
              </Badge>
            }
          />
        </Halo>
        <p className="text-sm text-oz-text-muted">{t('declaredHint')}</p>
        <p className="font-semibold" data-testid="onboarding-completeness">
          {t('completeness', { value: card.completeness })}
        </p>
        <Link
          href={ONBOARDING_PATH}
          data-testid="onboarding-finish"
          className="inline-flex min-h-11 items-center underline"
        >
          {t('finish')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="onboarding-oz-id-summary">
      <StepError failure={failure} />
      <dl className="grid grid-cols-1 gap-3 rounded-xl border border-oz-border p-4">
        {summary.map((item) => (
          <div key={item.label} className="flex flex-col">
            <dt className="text-sm text-oz-text-muted">{item.label}</dt>
            <dd className="font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
      <Button
        type="button"
        loading={pending}
        disabled={pending}
        data-testid="onboarding-complete"
        onClick={finalize}
      >
        {t('submit')}
      </Button>
    </div>
  );
}
