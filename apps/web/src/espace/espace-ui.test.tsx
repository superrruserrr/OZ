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
}));
vi.mock('../auth/logout-button', () => ({ LogoutButton: () => <button>Se déconnecter</button> }));
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

  it('avatar aux initiales vers Mon profil ; entrée active selon la page', () => {
    pathname = '/espace/messages';
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    const avatar = screen.getByTestId('espace-avatar');
    // Initiales décoratives, nom accessible « Mon profil » égal au texte lu (WCAG 2.5.3).
    expect(avatar.querySelector('[aria-hidden="true"]')?.textContent).toBe('AD');
    expect(avatar.textContent).toContain('Mon profil');
    expect(avatar.getAttribute('href')).toBe('/espace/profil');
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

  it('recherche d’une fonctionnalité : ouvre la page trouvée, sinon le dit', async () => {
    render(<EspaceShell initials="AD">contenu</EspaceShell>, { wrapper });
    const search = screen.getByRole('combobox', { name: 'Rechercher une fonctionnalité' });
    await userEvent.type(search, 'visib{Enter}');
    expect(push).toHaveBeenCalledWith('/espace/visibilite');
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz{Enter}');
    expect(screen.getByRole('status').textContent).toBe('Aucune fonctionnalité ne correspond.');
  });
});
