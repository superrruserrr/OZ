import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './app-shell.js';
import type { TabItem } from './tab-bar.js';

// Coquille applicative (lot 1.5bb, design.md §8.8) : repères, lien d'évitement, onglets et rail.

const ITEMS: TabItem[] = [
  { id: 'home', label: 'Accueil', href: '/accueil' },
  { id: 'search', label: 'Recherche', href: '/recherche', count: 2 },
];

describe('AppShell', () => {
  it('repères : en-tête, contenu principal focalisable, lien d’évitement vers lui', () => {
    render(
      <AppShell skipLabel="Aller au contenu" header={<span>OZ</span>}>
        <p>Contenu</p>
      </AppShell>,
    );
    expect(screen.getByRole('banner').textContent).toContain('OZ');
    const main = screen.getByRole('main');
    expect(main.id).toBe('contenu');
    expect(main.tabIndex).toBe(-1);
    const skip = screen.getByRole('link', { name: 'Aller au contenu' });
    expect(skip.getAttribute('href')).toBe('#contenu');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('avec navigation : barre d’onglets sur téléphone, rail en large écran, même onglet actif', () => {
    render(
      <AppShell
        skipLabel="Aller au contenu"
        header={null}
        nav={{
          label: 'Navigation principale',
          items: ITEMS,
          activeId: 'search',
          countLabel: (n) => `${String(n)} nouveaux`,
        }}
      >
        <p>x</p>
      </AppShell>,
    );
    const bar = screen.getByTestId('app-shell-tabs');
    const rail = screen.getByTestId('app-shell-rail');
    expect(bar.className).toContain('lg:hidden');
    expect(rail.className).toContain('hidden');
    expect(rail.className).toContain('lg:flex');
    const railLink = within(rail).getByRole('link', { name: 'Recherche, 2 nouveaux' });
    expect(railLink.getAttribute('aria-current')).toBe('page');
    expect(railLink.getAttribute('data-testid')).toBe('rail-search');
    expect(within(bar).getByTestId('tab-search').getAttribute('aria-current')).toBe('page');
  });

  it('le contenu garde la place de la barre du bas sur téléphone', () => {
    render(
      <AppShell skipLabel="s" header={null} nav={{ label: 'n', items: ITEMS, activeId: 'home' }}>
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole('main').className).toContain('pb-20');
  });
});
