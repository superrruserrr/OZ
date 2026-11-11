import { AppShell } from '@oz/ui';
import { Logo } from '@oz/ui/logo';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LogoutButton } from '../../../auth/logout-button';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { Link } from '../../../i18n/navigation';

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
  </svg>
);

/**
 * Espace connecté « Workspace » (lot 1.5dc) : coquille à rail (≥ 1024 px) et onglets bas, annuaire
 * des joueurs et fiches. Gardé par `proxy.ts` (ADR-010) ; l'API refait ses contrôles à chaque appel.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const p = useTranslations('players');
  return (
    <AppShell
      skipLabel={t('skip')}
      header={
        <>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center lg:hidden"
            data-testid="workspace-home"
          >
            <Logo alt={p('workspace')} className="h-9 max-sm:h-11" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <LogoutButton />
          </div>
        </>
      }
      railHeader={
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Logo alt={p('workspace')} className="h-9" />
        </Link>
      }
      nav={{
        label: t('label'),
        sectionLabel: p('workspace'),
        items: [
          { id: 'search', label: t('tabs.search'), href: '/recherche', icon: <SearchIcon /> },
        ],
        activeId: 'search',
        linkComponent: Link,
      }}
    >
      {children}
    </AppShell>
  );
}
