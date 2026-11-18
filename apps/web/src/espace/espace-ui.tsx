'use client';

import { AppShell, Button, Callout, Field } from '@oz/ui';
import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { LogoutButton } from '../auth/logout-button';
import { LocaleSwitcher } from '../components/locale-switcher';
import { Link, usePathname } from '../i18n/navigation';
import type { EspaceFailure } from './actions';

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
      <path d="M4 11l8-7 8 7v9H4z" />
    </svg>
  ),
  visibility: (
    <svg {...stroke} aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  data: (
    <svg {...stroke} aria-hidden="true">
      <path d="M12 3v12m-5-5l5 5 5-5M5 21h14" />
    </svg>
  ),
} as const;

export const ESPACE_ITEMS = [
  ['home', '/espace'],
  ['visibility', '/espace/visibilite'],
  ['data', '/espace/donnees'],
] as const;

/** Coquille de l'espace du joueur (lot 1.19b) : rail ≥ 1024 px, onglets bas, entrée active. */
export function EspaceShell({ children }: { readonly children: ReactNode }) {
  const t = useTranslations('espace.nav');
  const nav = useTranslations('nav');
  const pathname = usePathname();
  const active =
    [...ESPACE_ITEMS].reverse().find(([, href]) => pathname.startsWith(href))?.[0] ?? 'home';
  return (
    <AppShell
      skipLabel={nav('skip')}
      header={
        <>
          <Link href="/" className="inline-flex min-h-11 items-center lg:hidden">
            <Logo alt={t('label')} className="h-9 max-sm:h-11" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <LogoutButton />
          </div>
        </>
      }
      railHeader={
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Logo alt={t('label')} className="h-9" />
        </Link>
      }
      nav={{
        label: t('label'),
        sectionLabel: t('label'),
        items: ESPACE_ITEMS.map(([id, href]) => ({ id, label: t(id), href, icon: ICONS[id] })),
        activeId: active,
        linkComponent: Link,
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">{children}</div>
    </AppShell>
  );
}

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
