'use client';

import { Button, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { inviteGuardian, type GuardianFailure, type InviteResult } from './actions';
import { call, GuardianError } from './guardian-error';

type Sent = Extract<InviteResult, { ok: true }>;

/**
 * Le joueur mineur invite son tuteur (EX-108 n° 1, D1). Canal lien : affiché une seule fois, gardé
 * en mémoire de la page seulement ; rien ne le conserve après la navigation.
 */
export function InvitePanel() {
  const t = useTranslations('guardian.invite');
  const [sent, setSent] = useState<Sent | null>(null);
  const [failure, setFailure] = useState<GuardianFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  const send = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setCopied(false);
    void call(inviteGuardian).then((result) => {
      inFlight.current = false;
      setPending(false);
      if (result.ok) {
        setFailure(null);
        setSent(result);
      } else if (result.error === 'session') {
        window.location.reload();
      } else {
        setFailure(result);
      }
    });
  };

  const copy = (link: string): void => {
    void navigator.clipboard.writeText(link).then(
      () => {
        setCopied(true);
      },
      () => {
        setCopied(false);
      },
    );
  };

  return (
    <div className="flex flex-col gap-5" data-testid="guardian-invite">
      <GuardianError failure={failure} />
      <div aria-live="polite">
        {sent?.channel === 'email' ? (
          <Callout tone="legal" testId="guardian-invite-email">
            {t('emailSent')}
          </Callout>
        ) : null}
        {sent?.channel === 'link' ? (
          <Callout tone="legal" title={t('linkTitle')} testId="guardian-invite-link">
            <p>{t('linkLead')}</p>
            <label htmlFor="guardian-invite-url" className="mt-3 block font-semibold">
              {t('linkLabel')}
            </label>
            <input
              id="guardian-invite-url"
              data-testid="guardian-invite-url"
              readOnly
              value={sent.link}
              className="mt-1 w-full min-w-0 rounded-lg border border-oz-border bg-oz-surface-input px-3 py-2 text-sm break-all text-oz-text"
              onFocus={(event) => {
                event.currentTarget.select();
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              data-testid="guardian-invite-copy"
              onClick={() => {
                copy(sent.link);
              }}
            >
              {copied ? t('copied') : t('copy')}
            </Button>
          </Callout>
        ) : null}
      </div>
      <Button
        type="button"
        loading={pending}
        disabled={pending}
        data-testid="guardian-invite-send"
        onClick={send}
      >
        {sent === null ? t('send') : t('resend')}
      </Button>
      <p className="text-sm text-oz-text-muted">{t('resendHint')}</p>
    </div>
  );
}
