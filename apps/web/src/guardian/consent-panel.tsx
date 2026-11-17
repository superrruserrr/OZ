'use client';

import type { ConsentTextOutput } from '@oz/contracts';
import { Badge, Button, Callout, Field } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '../i18n/navigation';
import { grantConsent, revokeConsent, type GuardianFailure } from './actions';
import { call, GuardianError } from './guardian-error';
import { messageKey } from '../onboarding/field-message';

export interface ConsentPanelProps {
  readonly ozId: string;
  readonly text: ConsentTextOutput;
  readonly active: boolean;
  /** Publication : exige l'accord au traitement actif (R6). */
  readonly blockedBy?: 'requiresData' | undefined;
}

/**
 * Un accord (EX-108 n° 3 à 5) : texte présenté tel quel, puis accord ré-authentifié avec la version
 * et l'empreinte du texte lu ; retrait sans ré-authentification, confirmé, effet immédiat (CP-13).
 */
export function ConsentPanel({ ozId, text, active, blockedBy }: ConsentPanelProps) {
  const t = useTranslations('guardian.consent');
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<GuardianFailure | null>(null);
  const [notice, setNotice] = useState<'granted' | 'revoked' | null>(null);
  const prefix = `guardian-consent-${text.type}`;

  const done = (result: { ok: true } | GuardianFailure, success: 'granted' | 'revoked'): void => {
    setPending(false);
    if (result.ok) {
      setFailure(null);
      setPassword('');
      setCode('');
      setConfirming(false);
      setNotice(success);
      router.refresh();
    } else if (result.error === 'session') {
      window.location.reload();
    } else {
      setFailure(result);
      // Texte changé depuis la lecture : la page relit la version en vigueur.
      if (result.error === 'textStale') router.refresh();
    }
  };

  const give = (): void => {
    if (pending || !agreed || password === '') return;
    setPending(true);
    void call(() =>
      grantConsent(ozId, {
        type: text.type,
        textVersion: text.version,
        textSha256: text.sha256,
        password,
        ...(code === '' ? {} : { code }),
      }),
    ).then((result) => {
      done(result, 'granted');
    });
  };

  const revoke = (): void => {
    if (pending) return;
    setPending(true);
    void call(() => revokeConsent(ozId, text.type)).then((result) => {
      done(result.ok ? { ok: true } : result, 'revoked');
    });
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-oz-border p-4"
      data-testid={prefix}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t(`types.${messageKey(text.type)}`)}</h2>
        <Badge
          tone={active ? 'legal' : 'neutral'}
          status={active ? 'consent-active' : 'consent-inactive'}
        >
          {active ? t('active') : t('inactive')}
        </Badge>
      </div>
      <p className="text-sm text-oz-text-muted">
        {t('version', { version: text.version })}
        {text.version.includes('provisoire') ? (
          <span className="block">{t('provisional')}</span>
        ) : null}
      </p>
      <div
        className="max-h-72 overflow-y-auto rounded-lg bg-oz-surface-2 p-3 text-sm break-words whitespace-pre-line"
        tabIndex={0}
        data-testid={`${prefix}-text`}
      >
        {text.body}
      </div>
      <div aria-live="polite">
        {notice ? (
          <Callout tone="legal" testId={`${prefix}-notice`}>
            {t(notice)}
          </Callout>
        ) : null}
      </div>
      <GuardianError failure={failure} testId={`${prefix}-error`} />
      {active ? (
        confirming ? (
          <div className="flex flex-col gap-3">
            <p>{t('revokeConfirm')}</p>
            {text.type === 'guardian_data_processing' ? (
              <p className="text-sm text-oz-text-muted">{t('revokeDataHint')}</p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                loading={pending}
                disabled={pending}
                data-testid={`${prefix}-revoke-confirm`}
                onClick={revoke}
              >
                {t('confirm')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            data-testid={`${prefix}-revoke`}
            onClick={() => {
              setNotice(null);
              setConfirming(true);
            }}
          >
            {t('revoke')}
          </Button>
        )
      ) : blockedBy ? (
        <p className="text-sm text-oz-text-muted" data-testid={`${prefix}-blocked`}>
          {t(blockedBy)}
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            give();
          }}
        >
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={agreed}
              data-testid={`${prefix}-agree`}
              onChange={(event) => {
                setAgreed(event.currentTarget.checked);
              }}
            />
            <span>{t('agree')}</span>
          </label>
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
            disabled={pending || !agreed || password === ''}
            data-testid={`${prefix}-give`}
          >
            {t('give')}
          </Button>
        </form>
      )}
    </section>
  );
}
