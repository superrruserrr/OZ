'use client';

import { Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import type { GuardianFailure } from './actions';

/** Erreur d'un écran du tuteur, annoncée (`aria-live`) ; jamais un message de l'API. */
export function GuardianError({
  failure,
  testId = 'guardian-error',
}: {
  readonly failure: GuardianFailure | null;
  readonly testId?: string;
}) {
  const t = useTranslations('guardian.errors');
  return (
    <div aria-live="polite">
      {failure ? <Callout testId={testId}>{t(failure.error)}</Callout> : null}
    </div>
  );
}

/** Action serveur appelée du navigateur : coupure réseau ou réponse illisible → panne affichée. */
export async function call<T>(action: () => Promise<T>): Promise<T | GuardianFailure> {
  try {
    return await action();
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
