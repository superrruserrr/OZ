'use client';

import type { AccountDeletionOutput, DataExportOutput } from '@oz/contracts';
import { Badge, Button, Callout } from '@oz/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  cancelDeletion,
  exportDownloadUrl,
  requestDeletion,
  requestExport,
  type EspaceFailure,
} from './actions';
import { call, EspaceError, ReauthForm } from './espace-ui';

const day = { dateStyle: 'long' } as const;

/** Export des données (EX-118 n° 2) : suivi, demande ré-authentifiée, archive par URL signée. */
export function ExportPanel({ initial }: { readonly initial: DataExportOutput | null }) {
  const t = useTranslations('espace.data.export');
  const format = useFormatter();
  const [latest, setLatest] = useState(initial);
  const [failure, setFailure] = useState<EspaceFailure | null>(null);
  const [opening, setOpening] = useState(false);
  const open = latest !== null && ['pending', 'processing', 'ready'].includes(latest.status);
  const canRequest = latest === null || (!open && new Date(latest.nextRequestAt) <= new Date());
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-6"
      data-testid="espace-export"
    >
      <h2 className="text-xl font-medium">{t('title')}</h2>
      <p className="text-oz-text-muted">{t('lead')}</p>
      {latest === null ? null : (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="neutral" status={`export-${latest.status}`}>
            {t(`status.${latest.status}`)}
          </Badge>
          {open ? null : (
            <span className="text-oz-text-muted">
              {t('next', { date: format.dateTime(new Date(latest.nextRequestAt), day) })}
            </span>
          )}
        </p>
      )}
      <EspaceError failure={failure} testId="espace-export-error" />
      {latest?.status === 'ready' ? (
        <Button
          type="button"
          loading={opening}
          disabled={opening}
          data-testid="espace-export-download"
          onClick={() => {
            setOpening(true);
            void call(exportDownloadUrl).then((result) => {
              setOpening(false);
              if (result.ok) window.location.assign(result.url);
              else setFailure(result);
            });
          }}
        >
          {t('download')}
        </Button>
      ) : null}
      {canRequest ? (
        <ReauthForm
          prefix="espace-export"
          submitLabel={t('submit')}
          onSubmit={async (input) => {
            const result = await call(() => requestExport(input));
            if (result.ok) {
              setLatest(result.latest);
              setFailure(null);
              return true;
            }
            setFailure(result);
            return false;
          }}
        />
      ) : null}
    </section>
  );
}

/** Suppression du compte (EX-118 n° 3) : 30 jours pour annuler, OZ ID réservé à vie. */
export function DeletionPanel({ initial }: { readonly initial: AccountDeletionOutput | null }) {
  const t = useTranslations('espace.data.deletion');
  const format = useFormatter();
  const [pending, setPending] = useState(initial);
  const [failure, setFailure] = useState<EspaceFailure | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState(false);
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-6"
      data-testid="espace-deletion"
    >
      <h2 className="text-xl font-medium">{t('title')}</h2>
      <p className="text-oz-text-muted">{t('lead')}</p>
      <EspaceError failure={failure} testId="espace-deletion-error" />
      <div aria-live="polite">
        {notice ? <Callout testId="espace-deletion-cancelled">{t('cancelled')}</Callout> : null}
      </div>
      {pending !== null ? (
        <>
          <Callout testId="espace-deletion-pending">
            {t('pending', { date: format.dateTime(new Date(pending.scheduledFor), day) })}
          </Callout>
          <Button
            type="button"
            variant="secondary"
            loading={cancelling}
            disabled={cancelling}
            data-testid="espace-deletion-cancel"
            onClick={() => {
              setCancelling(true);
              void call(cancelDeletion).then((result) => {
                setCancelling(false);
                if (result.ok) {
                  setPending(null);
                  setFailure(null);
                  setNotice(true);
                } else {
                  setFailure(result);
                }
              });
            }}
          >
            {t('cancel')}
          </Button>
        </>
      ) : (
        <ReauthForm
          prefix="espace-deletion"
          submitLabel={t('submit')}
          ready={agreed}
          extra={
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-oz-primary"
                data-testid="espace-deletion-agree"
                checked={agreed}
                onChange={(event) => {
                  setAgreed(event.currentTarget.checked);
                }}
              />
              {t('confirm')}
            </label>
          }
          onSubmit={async (input) => {
            const result = await call(() => requestDeletion(input));
            if (result.ok) {
              setPending(result.pending);
              setFailure(null);
              setNotice(false);
              setAgreed(false);
              return true;
            }
            setFailure(result);
            return false;
          }}
        />
      )}
    </section>
  );
}
