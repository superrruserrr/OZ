'use client';

import { AppShell } from '@oz/ui';
import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { LogoutButton } from '../auth/logout-button';
import { LocaleSwitcher } from '../components/locale-switcher';
import { Link, usePathname, useRouter } from '../i18n/navigation';

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ICONS = {
  home: (
    <svg {...stroke} aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  profile: (
    <svg {...stroke} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  performances: (
    <svg {...stroke} aria-hidden="true">
      <path d="M3 17l5-6 4 4 4-7 5 5" />
      <path d="M3 21h18" />
    </svg>
  ),
  videos: (
    <svg {...stroke} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </svg>
  ),
  messages: (
    <svg {...stroke} aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 10h8" />
    </svg>
  ),
  visibility: (
    <svg {...stroke} aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  settings: (
    <svg {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  search: (
    <svg {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  ),
  bell: (
    <svg {...stroke} aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
    </svg>
  ),
} as const;

/** Entrées principales : rail et onglets du bas (cinq au plus). */
const MAIN = [
  ['home', '/espace'],
  ['profile', '/espace/profil'],
  ['performances', '/espace/performances'],
  ['videos', '/espace/videos'],
  ['messages', '/espace/messages'],
] as const;

/** Réglages : rail seulement ; au téléphone, par les cartes de l'accueil et l'avatar. */
const SETTINGS = [
  ['visibility', '/espace/visibilite'],
  ['settings', '/espace/donnees'],
] as const;

export const ESPACE_ITEMS = [...MAIN, ...SETTINGS] as const;
type EspaceItemId = (typeof ESPACE_ITEMS)[number][0];

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Recherche d'une fonctionnalité de l'espace : ouvre la première page dont le nom correspond. */
function FeatureSearch({ labels }: { readonly labels: Record<EspaceItemId, string> }) {
  const t = useTranslations('espace.nav');
  const router = useRouter();
  const listId = useId();
  const [miss, setMiss] = useState(false);
  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get('q');
    const query = normalize(typeof raw === 'string' ? raw : '');
    const found = query
      ? ESPACE_ITEMS.find(([id]) => normalize(labels[id]).includes(query))
      : undefined;
    setMiss(!found);
    if (found) router.push(found[1]);
  };
  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="relative hidden w-full max-w-md md:block"
      data-testid="espace-search"
    >
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-oz-text-muted [&>svg]:size-5">
        {ICONS.search}
      </span>
      <input
        type="search"
        name="q"
        list={listId}
        aria-label={t('searchLabel')}
        placeholder={t('search')}
        onChange={() => {
          setMiss(false);
        }}
        className="min-h-11 w-full rounded-full border border-oz-border bg-oz-surface-1 pr-4 pl-12 text-sm text-oz-text placeholder:text-oz-text-label focus:border-oz-primary/60"
      />
      <datalist id={listId}>
        {ESPACE_ITEMS.map(([id]) => (
          <option key={id} value={labels[id]} />
        ))}
      </datalist>
      <p role="status" className="absolute top-full left-4 mt-1 text-xs text-oz-text-muted">
        {miss ? t('searchNone') : ''}
      </p>
    </form>
  );
}

/** Illustration du bas du rail : silhouette en course, sans visage (EX-T16), décorative. */
function RailArt() {
  return (
    <svg viewBox="0 0 200 90" aria-hidden="true" className="h-20 w-full text-oz-primary">
      <path d="M0 80 C60 64 140 64 200 80 V90 H0 Z" className="fill-oz-primary/10" />
      <g fill="currentColor" opacity="0.8">
        <circle cx="118" cy="22" r="6" />
        <path d="M112 30 l-10 16 l-14 6 l3 4 l16 -6 l6 -8 l4 12 l-8 14 l5 3 l10 -16 l-3 -14 l10 4 l8 -8 l-4 -3 l-6 5 l-12 -9 z" />
        <circle cx="78" cy="70" r="4" />
      </g>
    </svg>
  );
}

/**
 * Coquille de l'espace du joueur (lot 1.19b, maquette v2 du 2026-11-18) : rail de sept entrées qui
 * mènent toutes à une page ; les pages pas encore alimentées le disent (« Bientôt disponible »), sans
 * chiffre inventé. En-tête : recherche de fonctionnalité, langue, cloche (à venir), avatar.
 */
export function EspaceShell({
  children,
  initials,
}: {
  readonly children: ReactNode;
  readonly initials: string | null;
}) {
  const t = useTranslations('espace.nav');
  const nav = useTranslations('nav');
  const pathname = usePathname();
  const labels = Object.fromEntries(ESPACE_ITEMS.map(([id]) => [id, t(id)])) as Record<
    EspaceItemId,
    string
  >;
  const active =
    [...ESPACE_ITEMS]
      .filter(([, href]) => href !== '/espace')
      .find(([, href]) => pathname === href || pathname.startsWith(`${href}/`))?.[0] ?? 'home';
  const item = ([id, href]: (typeof ESPACE_ITEMS)[number]) => ({
    id,
    label: labels[id],
    href,
    icon: ICONS[id],
  });
  return (
    <AppShell
      skipLabel={nav('skip')}
      header={
        <>
          <Link
            href="/espace"
            data-testid="espace-logo"
            className="inline-flex min-h-11 items-center lg:hidden"
          >
            <Logo alt={t('label')} className="h-9" />
          </Link>
          <FeatureSearch labels={labels} />
          {/* 320 px : logo, langue et déconnexion tiennent sur une ligne (audit EX-T22). */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <LocaleSwitcher />
            <span
              role="img"
              aria-disabled="true"
              aria-label={t('notifications')}
              title={t('notifications')}
              data-testid="espace-notifications"
              className="hidden size-11 place-items-center rounded-full text-oz-text-muted sm:grid [&>svg]:size-5"
            >
              {ICONS.bell}
            </span>
            {initials ? (
              <Link
                href="/espace/profil"
                aria-label={t('profile')}
                data-testid="espace-avatar"
                className="hidden size-11 place-items-center rounded-full border-2 border-oz-primary text-sm font-medium text-oz-primary sm:grid"
              >
                {initials}
              </Link>
            ) : null}
            <LogoutButton />
          </div>
        </>
      }
      railHeader={
        <Link href="/espace" className="inline-flex min-h-11 items-center">
          <Logo alt={t('label')} className="h-9" />
        </Link>
      }
      nav={{
        label: t('label'),
        sectionLabel: t('label'),
        items: MAIN.map(item),
        secondary: { label: t('settingsSection'), items: SETTINGS.map(item) },
        activeId: active,
        linkComponent: Link,
      }}
      railFooter={
        <div className="flex flex-col gap-4">
          <Link
            href="/contact"
            data-testid="espace-help"
            className="flex min-h-11 flex-col justify-center rounded-xl border border-oz-border px-4 py-3 text-sm hover:border-oz-primary/40"
          >
            <span className="font-medium text-oz-text">{t('help')}</span>
            <span className="text-oz-text-muted">{t('helpLead')}</span>
          </Link>
          <div className="px-1">
            <RailArt />
            <p className="text-sm text-oz-text">{t('slogan')}</p>
            <p className="text-sm text-oz-primary">{t('sloganAccent')}</p>
          </div>
        </div>
      }
    >
      <div
        data-testid="espace-content"
        className={`mx-auto flex w-full flex-col gap-8 ${active === 'home' ? 'max-w-6xl' : 'max-w-3xl'}`}
      >
        {children}
      </div>
    </AppShell>
  );
}
