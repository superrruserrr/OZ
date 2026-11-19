'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { logout } from '../auth/actions';
import { Link } from '../i18n/navigation';

const LINKS = [
  ['profile', '/espace/profil'],
  ['visibility', '/espace/visibilite'],
  ['settings', '/espace/donnees'],
] as const;

const itemClass =
  'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-oz-text hover:bg-oz-surface-2 focus-visible:bg-oz-surface-2';

/**
 * Menu de l'avatar (lot 1.19c) : la déconnexion n'est plus un bouton de l'en-tête, mais la dernière
 * entrée d'un menu discret. Motif « menu button » de l'APG : ↓/Entrée/Espace ouvrent sur la première
 * entrée, ↑ sur la dernière, flèches circulaires, Début/Fin, Échap et Tab ferment ; Échap rend le focus.
 */
export function AvatarMenu({
  initials,
  photoId = null,
}: {
  readonly initials: string | null;
  /** Photo de profil saine (lot 1.19cd), relayée par le site ; sinon les initiales. */
  readonly photoId?: string | null;
}) {
  const t = useTranslations('espace.nav');
  const router = useRouter();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<'first' | 'last'>('first');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const list = items.current.filter((item) => item !== null);
    (initial === 'first' ? list[0] : list.at(-1))?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, initial]);

  const show = (where: 'first' | 'last') => {
    setInitial(where);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      show('last');
    }
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter((item) => item !== null);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(list.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
  };

  const signOut = () => {
    setPending(true);
    void logout().then(() => {
      router.replace('/');
    });
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        id={`${menuId}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="espace-avatar"
        onClick={() => {
          if (open) close(false);
          else show('first');
        }}
        onKeyDown={onButtonKey}
        className="grid size-11 place-items-center overflow-hidden rounded-full border-2 border-oz-primary text-sm font-medium text-oz-primary hover:bg-oz-primary/10"
      >
        {photoId ? (
          <Image
            src={`/api/photos?joueur=me&id=${encodeURIComponent(photoId)}`}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="size-10 rounded-full object-cover"
          />
        ) : initials ? (
          <span aria-hidden="true">{initials}</span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
            className="size-5"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        )}
        <span className="sr-only">{t('account')}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={`${menuId}-button`}
          onKeyDown={onMenuKey}
          data-testid="espace-avatar-menu"
          className="absolute top-full right-0 z-30 mt-2 flex w-56 flex-col gap-0.5 rounded-xl border border-oz-border bg-oz-surface-1 p-1.5 shadow-lg"
        >
          {LINKS.map(([id, href], index) => (
            <Link
              key={id}
              ref={(element: HTMLAnchorElement | null) => {
                items.current[index] = element;
              }}
              href={href}
              role="menuitem"
              tabIndex={-1}
              data-testid={`espace-avatar-${id}`}
              className={itemClass}
              onClick={() => {
                close(false);
              }}
            >
              {t(id)}
            </Link>
          ))}
          <hr className="my-1 border-oz-border" />
          <button
            ref={(element) => {
              items.current[LINKS.length] = element;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={pending}
            aria-busy={pending}
            data-testid="logout"
            onClick={signOut}
            className={`${itemClass} text-oz-text-muted`}
          >
            {t('logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
