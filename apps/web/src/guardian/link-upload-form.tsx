'use client';

import { Button, Callout, Select } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { submitLink, uploadPiece, type GuardianFailure } from './actions';
import { call, GuardianError } from './guardian-error';
import { messageKey } from '../onboarding/field-message';

type PieceKind = 'birth_certificate' | 'guardianship_order';
interface Piece {
  readonly documentId: string;
  readonly kind: PieceKind;
  readonly name: string;
}
const MAX_PIECES = 3;

/**
 * Dépôt du justificatif (EX-108 n° 2, R3) : chaque pièce part au serveur du site, qui la contrôle
 * et la relaie au stockage (B1) ; puis le dépôt est soumis à la revue d'OZ. Aucun fichier n'est
 * relu ici : la pièce n'est lisible que d'un administrateur.
 */
export function LinkUploadForm({ guardianId }: { readonly guardianId: string }) {
  const t = useTranslations('guardian.link');
  const [kind, setKind] = useState<PieceKind>('birth_certificate');
  const [pieces, setPieces] = useState<readonly Piece[]>([]);
  const [failure, setFailure] = useState<GuardianFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const settle = (result: GuardianFailure): void => {
    if (result.error === 'session') window.location.reload();
    else setFailure(result);
  };

  const add = (): void => {
    const file = fileInput.current?.files?.[0];
    if (pending || file === undefined || pieces.length >= MAX_PIECES) return;
    const form = new FormData();
    form.set('guardianId', guardianId);
    form.set('documentType', kind);
    form.set('file', file);
    setPending(true);
    void call(() => uploadPiece(form)).then((result) => {
      setPending(false);
      if (result.ok) {
        setFailure(null);
        setPieces((current) => [
          ...current,
          { documentId: result.documentId, kind, name: file.name },
        ]);
        if (fileInput.current) fileInput.current.value = '';
      } else {
        settle(result);
      }
    });
  };

  const submit = (): void => {
    if (pending || pieces.length === 0) return;
    setPending(true);
    void call(() =>
      submitLink({ guardianId, documentIds: pieces.map((piece) => piece.documentId) }),
    ).then((result) => {
      setPending(false);
      if (result.ok) {
        setFailure(null);
        setSent(true);
      } else {
        settle(result);
      }
    });
  };

  if (sent) {
    return (
      <div aria-live="polite">
        <Callout tone="legal" testId="guardian-link-sent">
          {t('sent')}
        </Callout>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="guardian-link-form">
      <GuardianError failure={failure} />
      <Select
        id="guardian-link-type"
        data-testid="guardian-link-type"
        label={t('type')}
        value={kind}
        onValueChange={(value) => {
          setKind(value === 'guardianship_order' ? 'guardianship_order' : 'birth_certificate');
        }}
        options={(['birth_certificate', 'guardianship_order'] as const).map((value) => ({
          value,
          label: t(`types.${messageKey(value)}`),
        }))}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="guardian-link-file" className="font-medium">
          {t('file')}
        </label>
        <input
          ref={fileInput}
          id="guardian-link-file"
          data-testid="guardian-link-file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={pending || pieces.length >= MAX_PIECES}
          className="min-h-11 w-full min-w-0 text-sm"
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        disabled={pending || pieces.length >= MAX_PIECES}
        data-testid="guardian-link-add"
        onClick={add}
      >
        {t('add')}
      </Button>
      <div>
        <h2 className="font-medium">{t('pieces')}</h2>
        {pieces.length === 0 ? (
          <p className="text-sm text-oz-text-muted">{t('none')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="guardian-link-pieces">
            {pieces.map((piece) => (
              <li key={piece.documentId} className="break-all">
                {t('piece', { type: t(`types.${messageKey(piece.kind)}`), name: piece.name })}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm text-oz-text-muted">{t('scanning')}</p>
      <Button
        type="button"
        loading={pending}
        disabled={pending || pieces.length === 0}
        data-testid="guardian-link-submit"
        onClick={submit}
      >
        {t('submit')}
      </Button>
    </div>
  );
}
