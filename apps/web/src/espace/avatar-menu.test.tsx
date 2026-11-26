import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';
import { AvatarMenu } from './avatar-menu';

const logout = vi.fn(() => Promise.resolve());
const replace = vi.fn();
vi.mock('../i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock('../auth/actions', () => ({ logout: () => logout() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);

describe('menu de l’avatar (lot 1.19c)', () => {
  beforeEach(() => {
    logout.mockClear();
    replace.mockClear();
  });

  it('s’ouvre au clavier, se parcourt aux flèches, Échap le ferme et rend le focus', async () => {
    const user = userEvent.setup();
    render(<AvatarMenu initials="AP" />, { wrapper });
    const button = screen.getByTestId('espace-avatar');
    button.focus();
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Mon profil',
      'Visibilité',
      'Paramètres',
      'Se déconnecter',
    ]);
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[3]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(items[3]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('clic à l’extérieur : fermé', async () => {
    const user = userEvent.setup();
    render(
      <>
        <AvatarMenu initials="AP" />
        <p>dehors</p>
      </>,
      { wrapper },
    );
    await user.click(screen.getByTestId('espace-avatar'));
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.click(screen.getByText('dehors'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('déconnexion : action serveur puis retour à l’accueil', async () => {
    const user = userEvent.setup();
    render(<AvatarMenu initials="AP" />, { wrapper });
    await user.click(screen.getByTestId('espace-avatar'));
    await user.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(logout).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/');
    });
  });

  it('sans initiales : pictogramme, même menu', () => {
    render(<AvatarMenu initials={null} />, { wrapper });
    expect(screen.getByTestId('espace-avatar').textContent).toContain('Mon compte');
  });
});
