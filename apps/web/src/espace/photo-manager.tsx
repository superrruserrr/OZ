'use client';

import type { PlayerPhotosOutput } from '@oz/contracts';
import { Button, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  chooseProfilePhoto,
  listOwnPhotos,
  removePhoto,
  uploadPhoto,
  type PhotoFailure,
} from './photo-actions';

/** Adresse de l'image relayée par le site (même origine, CSP inchangée). */
export const ownPhotoSrc = (id: string): string =>
  `/api/photos?joueur=me&id=${encodeURIComponent(id)}`;

const POLL_MS = 4000;
const POLL_MAX = 15;

/**
 * Mes photos (lot 1.19cd) : photo de profil et galerie, six au plus. Chaque photo est analysée
 * (antivirus, ré-encodage, EXIF retiré) avant d'être affichée ; l'écran le dit et relit l'état
 * quelques secondes. Le joueur choisit la photo de profil ou retire une photo ; un mineur voit sa
 * galerie, son tuteur la gère.
 */
export function PhotoManager({
  playerId,
  initial,
}: {
  readonly playerId: string;
  readonly initial: PlayerPhotosOutput;
}) {
  const t = useTranslations('espace.photos');
  const [gallery, setGallery] = useState(initial);
  const [failure, setFailure] = useState<PhotoFailure | null>(null);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const polls = useRef(0);
  const analysing = gallery.items.some((photo) => photo.status === 'pending');
  const full = gallery.items.filter((photo) => photo.status !== 'rejected').length >= gallery.limit;

  useEffect(() => {
    if (!analysing || polls.current >= POLL_MAX) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      void listOwnPhotos().then((result) => {
        if (result.ok) setGallery(result.gallery);
      });
    }, POLL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [analysing, gallery]);

  const apply = (promise: Promise<Awaited<ReturnType<typeof listOwnPhotos>>>) => {
    setPending(true);
    setFailure(null);
    void promise.then((result) => {
      setPending(false);
      if (result.ok) {
        polls.current = 0;
        setGallery(result.gallery);
      } else {
        setFailure(result);
      }
    });
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('playerId', playerId);
    form.set('file', file);
    apply(uploadPhoto(form));
  };

  return (
    <section
      aria-labelledby="espace-photos-title"
      className="flex flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-6"
      data-testid="espace-photos"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="espace-photos-title" className="text-lg font-medium text-oz-text">
          {t('title')}
        </h2>
        <p className="text-sm text-oz-text-muted" data-testid="espace-photos-count">
          {t('count', { count: gallery.items.length, limit: gallery.limit })}
        </p>
      </div>
      <p className="text-sm text-oz-text-muted">{t('lead')}</p>
      <div aria-live="polite">
        {failure ? (
          <Callout testId="espace-photos-error">{t(`errors.${failure.error}`)}</Callout>
        ) : null}
      </div>
      {gallery.items.length === 0 ? (
        <p className="text-sm text-oz-text-label" data-testid="espace-photos-empty">
          {t('empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gallery.items.map((photo) => (
            <li
              key={photo.id}
              data-testid={`espace-photo-${photo.status}`}
              className="flex flex-col overflow-hidden rounded-xl border border-oz-border bg-oz-surface-2"
            >
              <div className="relative aspect-square">
                {photo.status === 'clean' ? (
                  // Relayée par le site, déjà ré-encodée par le worker : l'optimiseur n'y a pas accès.
                  <Image
                    src={ownPhotoSrc(photo.id)}
                    alt={photo.isProfile ? t('profileAlt') : t('galleryAlt')}
                    fill
                    unoptimized
                    sizes="(min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <p className="grid size-full place-items-center p-3 text-center text-sm text-oz-text-muted">
                    {photo.status === 'pending' ? t('analysing') : t('refused')}
                  </p>
                )}
                {photo.isProfile ? (
                  <span className="absolute top-2 left-2 rounded-full bg-oz-primary px-2.5 py-1 text-xs font-medium text-oz-on-primary">
                    {t('profileBadge')}
                  </span>
                ) : null}
              </div>
              {gallery.manageable ? (
                <div className="flex flex-wrap gap-1 p-2">
                  {photo.status === 'clean' && !photo.isProfile ? (
                    <button
                      type="button"
                      disabled={pending}
                      data-testid="espace-photo-make-profile"
                      onClick={() => {
                        apply(chooseProfilePhoto(photo.id));
                      }}
                      className="min-h-11 flex-1 rounded-lg px-2 text-xs text-oz-primary hover:bg-oz-primary/10"
                    >
                      {t('makeProfile')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    data-testid="espace-photo-remove"
                    onClick={() => {
                      apply(removePhoto(photo.id));
                    }}
                    className="min-h-11 flex-1 rounded-lg px-2 text-xs text-oz-text-muted hover:bg-oz-surface-1"
                  >
                    {t('remove')}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {gallery.manageable ? (
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="espace-photo-input"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="secondary"
            loading={pending}
            disabled={pending || full}
            data-testid="espace-photo-add"
            onClick={() => input.current?.click()}
          >
            {full ? t('full') : t('add')}
          </Button>
          <p className="text-xs text-oz-text-label">{t('rules')}</p>
        </div>
      ) : (
        <p className="text-sm text-oz-text-muted">{t('guardian')}</p>
      )}
    </section>
  );
}
