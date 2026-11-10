'use client';

import { Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import type { AuthFailure } from './actions';

/** Erreur générale d'un formulaire de compte, annoncée (`aria-live`) ; jamais un message de l'API. */
export function FormError({ failure, testId }: { failure: AuthFailure | null; testId: string }) {
  const t = useTranslations('auth.errors');
  const text =
    failure === null
      ? null
      : failure.error === 'retryLater' && failure.retryAfterSeconds !== undefined
        ? t('retryAfter', { seconds: failure.retryAfterSeconds })
        : t(failure.error);
  return (
    <div aria-live="polite">
      {text ? (
        <Callout testId={testId}>
          <span role="alert">{text}</span>
        </Callout>
      ) : null}
    </div>
  );
}
