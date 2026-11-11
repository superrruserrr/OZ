import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SiteTopbar } from './site-topbar.js';

const LINKS = [
  { href: '/tarifs', label: 'Tarifs', id: 'pricing' },
  { href: '/a-propos', label: 'À propos', id: 'about' },
];

function renderTopbar() {
  return render(
    <SiteTopbar
      brand={<a href="/">OZ</a>}
      navLabel="Navigation du site"
      links={LINKS}
      actions={<a href="/auth/role">Créer un compte</a>}
      menuLabel="Menu"
      closeLabel="Fermer le menu"
    />,
  );
}

describe('SiteTopbar', () => {
  it('logo, navigation centrale (≥ 640 px) et actions', () => {
    renderTopbar();
    const banner = screen.getByRole('banner');
    expect(banner.className).toContain('sticky');
    const nav = screen.getByRole('navigation', { name: 'Navigation du site' });
    expect(nav.className).toContain('max-sm:hidden');
    expect(within(nav).getByRole('link', { name: 'Tarifs' }).dataset.testid).toBe(
      'site-nav-pricing',
    );
    expect(screen.getByRole('link', { name: 'Créer un compte' })).toBeTruthy();
  });

  it('menu mobile : feuille modale, Échap la ferme et rend le focus au bouton', async () => {
    renderTopbar();
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(sheet).getByRole('link', { name: 'Tarifs' })).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: 'Créer un compte' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('un lien choisi dans la feuille la ferme (changement de page)', async () => {
    renderTopbar();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const sheet = screen.getByRole('dialog');
    within(sheet)
      .getByRole('link', { name: 'À propos' })
      .addEventListener('click', (e) => {
        e.preventDefault();
      });
    await userEvent.click(within(sheet).getByRole('link', { name: 'À propos' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
