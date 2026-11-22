'use client';

import { Button, Callout, Field } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import type { EspaceFailure } from './actions';

/** Erreur annoncée (`aria-live`) ; jamais un message de l'API. */
export function EspaceError({
  failure,
  testId,
}: {
  readonly failure: EspaceFailure | null;
  readonly testId: string;
}) {
  const t = useTranslations('espace.errors');
  return (
    <div aria-live="polite">
      {failure ? <Callout testId={testId}>{t(failure.error)}</Callout> : null}
    </div>
  );
}

/** Action serveur appelée du navigateur : coupure réseau → panne affichée, jamais un bouton bloqué. */
export async function call<T>(action: () => Promise<T>): Promise<T | EspaceFailure> {
  try {
    return await action();
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/**
 * Ré-authentification (D2 des lots 1.16) : mot de passe, plus le code si la 2FA est active. Rien
 * n'est gardé après l'envoi.
 */
export function ReauthForm({
  prefix,
  submitLabel,
  extra,
  ready = true,
  onSubmit,
}: {
  readonly prefix: string;
  readonly submitLabel: string;
  readonly extra?: ReactNode;
  readonly ready?: boolean;
  readonly onSubmit: (input: { password: string; code?: string }) => Promise<boolean>;
}) {
  const t = useTranslations('espace.reauth');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    void onSubmit(code === '' ? { password } : { password, code }).then((done) => {
      setPending(false);
      if (done) {
        setPassword('');
        setCode('');
      }
    });
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      data-testid={`${prefix}-form`}
      onSubmit={submit}
    >
      {extra}
      <Field
        id={`${prefix}-password`}
        data-testid={`${prefix}-password`}
        label={t('password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.currentTarget.value);
        }}
      />
      <Field
        id={`${prefix}-code`}
        data-testid={`${prefix}-code`}
        label={t('code')}
        hint={t('codeHint')}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => {
          setCode(event.currentTarget.value.trim());
        }}
      />
      <Button
        type="submit"
        loading={pending}
        disabled={pending || !ready || password === ''}
        data-testid={`${prefix}-submit`}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
