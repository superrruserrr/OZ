import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';
import { EspaceShell } from './espace-shell';

const push = vi.fn();
let pathname = '/espace';
vi.mock('../i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  usePathname: () => pathname,
  useRouter: () => ({ push }),
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === 'fr' ? href : `/${locale}${href}`,
}));
vi.mock('../auth/actions', () => ({ logout: vi.fn(() => Promise.resolve()) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../components/locale-switcher', () => ({ LocaleSwitcher: () => null }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);

describe('coquille de l’espace (tableau de bord v2)', () => {
  beforeEach(() => {
    push.mockReset();
    pathname = '/espace';
  });

  it('rail de la maquette : sept entrées, toutes des liens qui mènent à une page', () => {
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    const rail = screen.getByTestId('app-shell-rail');
    const expected = {
      home: '/espace',
      profile: '/espace/profil',
      performances: '/espace/performances',
      videos: '/espace/videos',
      messages: '/espace/messages',
      visibility: '/espace/visibilite',
      settings: '/espace/donnees',
    };
    for (const [id, href] of Object.entries(expected)) {
      expect(within(rail).getByTestId(`rail-${id}`).getAttribute('href'), id).toBe(href);
    }
    // Barre du bas : cinq onglets au plus.
    expect(
      within(screen.getByTestId('app-shell-tabs')).getAllByRole('link').length,
    ).toBeLessThanOrEqual(5);
  });

  it('avatar : bouton de menu aux initiales ; entrée active selon la page', () => {
    pathname = '/espace/messages';
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    const avatar = screen.getByTestId('espace-avatar');
    // Initiales décoratives, nom accessible lu (WCAG 2.5.3) ; aucun bouton de déconnexion visible.
    expect(avatar.querySelector('[aria-hidden="true"]')?.textContent).toBe('AD');
    expect(avatar.getAttribute('aria-haspopup')).toBe('menu');
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menuitem', { name: 'Se déconnecter' })).toBeNull();
    const rail = screen.getByTestId('app-shell-rail');
    expect(within(rail).getByTestId('rail-messages').getAttribute('aria-current')).toBe('page');
  });

  it('accueil large, autres pages étroites', () => {
    const { unmount } = render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    expect(screen.getByTestId('espace-content').className).toContain('max-w-6xl');
    unmount();
    pathname = '/espace/visibilite';
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    expect(screen.getByTestId('espace-content').className).toContain('max-w-3xl');
  });

  it('cloche désactivée, sans chiffre', () => {
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    const bell = screen.getByTestId('espace-notifications');
    expect(bell.getAttribute('aria-disabled')).toBe('true');
    expect(bell.textContent).not.toMatch(/\d/);
  });

  it('recherche de joueurs : relais vers l’annuaire, sans JavaScript aussi', async () => {
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    const form = screen.getByRole('search');
    expect(form.getAttribute('action')).toBe('/recherche');
    expect(form.getAttribute('method')).toBe('get');
    const input = screen.getByRole('searchbox', { name: 'Chercher un joueur' });
    await userEvent.type(input, '  Abena  {Enter}');
    expect(push).toHaveBeenCalledWith({ pathname: '/recherche', query: { q: 'Abena' } });
    push.mockReset();
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(push).toHaveBeenCalledWith({ pathname: '/recherche' });
  });
});
