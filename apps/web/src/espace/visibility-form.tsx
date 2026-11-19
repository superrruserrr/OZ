'use client';

import type { PlayerVisibilityOutput } from '@oz/contracts';
import { Button, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { saveVisibility, type EspaceFailure } from './actions';
import { call, EspaceError } from './espace-ui';

const BLOCKS = ['location', 'physical', 'sport', 'photos'] as const;

/**
 * Visibilité des blocs de la fiche (EX-115, lot 1.19b) : cocher = visible des lecteurs autorisés.
 * L'état affiché après l'envoi est celui rendu par l'API, jamais celui supposé par l'écran.
 */
export function VisibilityForm({
  ozId,
  initial,
}: {
  readonly ozId: string;
  readonly initial: PlayerVisibilityOutput;
}) {
  const t = useTranslations('espace.visibility');
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [failure, setFailure] = useState<EspaceFailure | null>(null);
  const [notice, setNotice] = useState(false);
  const [pending, setPending] = useState(false);
  const visible = (value: PlayerVisibilityOutput, block: (typeof BLOCKS)[number]) =>
    value[block] !== false;
  const changed = BLOCKS.filter((block) => visible(draft, block) !== visible(saved, block));
  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (changed.length === 0) return;
    setPending(true);
    setNotice(false);
    const input = Object.fromEntries(changed.map((block) => [block, visible(draft, block)]));
    void call(() => saveVisibility(ozId, input)).then((result) => {
      setPending(false);
      if (result.ok) {
        setSaved(result.visibility);
        setDraft(result.visibility);
        setFailure(null);
        setNotice(true);
      } else {
        setFailure(result);
      }
    });
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      data-testid="espace-visibility-form"
      onSubmit={submit}
    >
      <EspaceError failure={failure} testId="espace-visibility-error" />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm text-oz-text-label">{t('legend')}</legend>
        {BLOCKS.map((block) => (
          <label
            key={block}
            className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-oz-border bg-oz-surface-2 px-4 py-3"
          >
            <span>{t(`blocks.${block}`)}</span>
            <span className="flex items-center gap-3 text-sm text-oz-text-muted">
              {visible(draft, block) ? t('shown') : t('hidden')}
              <input
                type="checkbox"
                className="size-5 accent-oz-primary"
                data-testid={`espace-visibility-${block}`}
                checked={visible(draft, block)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setDraft((current) => ({ ...current, [block]: checked }));
                }}
              />
            </span>
          </label>
        ))}
      </fieldset>
      <div aria-live="polite">
        {notice ? <Callout testId="espace-visibility-saved">{t('saved')}</Callout> : null}
      </div>
      <Button
        type="submit"
        loading={pending}
        disabled={pending || changed.length === 0}
        data-testid="espace-visibility-submit"
      >
        {t('save')}
      </Button>
    </form>
  );
}
