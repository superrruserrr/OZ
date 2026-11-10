import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DotPagination } from './dot-pagination.js';
import { FilterChip } from './filter-chip.js';
import { TabBar, type TabItem } from './tab-bar.js';

// Puces de filtre, barre d'onglets, pagination à points (§8.6, E15).

describe('FilterChip', () => {
  it('bouton à bascule : aria-pressed ; active en fond primary plein', async () => {
    const onPressedChange = vi.fn();
    const { rerender } = render(
      <FilterChip testId="filter-position-mf" pressed={false} onPressedChange={onPressedChange}>
        Milieu
      </FilterChip>,
    );
    const chip = screen.getByTestId('filter-position-mf');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(chip);
    expect(onPressedChange).toHaveBeenCalledWith(true);
    rerender(
      <FilterChip testId="filter-position-mf" pressed onPressedChange={onPressedChange}>
        Milieu
      </FilterChip>,
    );
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.className).toContain('bg-oz-primary');
    expect(chip.className).toContain('text-oz-on-primary');
  });

  it('puce appliquée : bouton « × » libellé, seulement si elle est active', async () => {
    const onRemove = vi.fn();
    const { rerender } = render(
      <FilterChip testId="f" pressed={false} onRemove={onRemove} removeLabel="Retirer Milieu">
        Milieu
      </FilterChip>,
    );
    expect(screen.queryByRole('button', { name: 'Retirer Milieu' })).toBeNull();
    rerender(
      <FilterChip testId="f" pressed onRemove={onRemove} removeLabel="Retirer Milieu">
        Milieu
      </FilterChip>,
    );
    await userEvent.click(screen.getByTestId('f-remove'));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Retirer Milieu' })).toBeTruthy();
  });
});

const TABS: TabItem[] = [
  { id: 'home', label: 'Accueil', href: '/accueil', icon: <svg /> },
  { id: 'search', label: 'Recherche', href: '/recherche', icon: <svg /> },
  { id: 'messages', label: 'Messages', href: '/messages', icon: <svg />, count: 120 },
];

describe('TabBar', () => {
  it('navigation nommée, liens, onglet actif en aria-current', () => {
    render(
      <TabBar
        label="Navigation principale"
        items={TABS}
        activeId="search"
        countLabel={(n) => `${String(n)} non lus`}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeTruthy();
    const active = screen.getByTestId('tab-search');
    expect(active.getAttribute('href')).toBe('/recherche');
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('tab-home').getAttribute('aria-current')).toBeNull();
  });

  it('compteur plafonné à 99+ et annoncé dans le libellé', () => {
    render(
      <TabBar label="n" items={TABS} activeId="home" countLabel={(n) => `${String(n)} non lus`} />,
    );
    const tab = screen.getByRole('link', { name: 'Messages, 120 non lus' });
    expect(tab.textContent).toContain('99+');
  });

  it('composant de lien fourni par l’appelant (routeur de l’application)', () => {
    function AppLink(props: { href: string; children?: React.ReactNode }) {
      return <a data-router="yes" {...props} />;
    }
    render(<TabBar label="n" items={TABS} activeId="home" linkComponent={AppLink} />);
    expect(screen.getByTestId('tab-home').dataset.router).toBe('yes');
  });

  it('plus de 5 onglets : erreur de programmation', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `t${String(i)}`,
      label: `T${String(i)}`,
      href: `/${String(i)}`,
    }));
    expect(() => render(<TabBar label="n" items={many} activeId="t0" />)).toThrow(RangeError);
  });
});

describe('DotPagination', () => {
  it('points libellés, actif en aria-current et étiré (E15)', async () => {
    const onSelect = vi.fn();
    render(
      <DotPagination
        testId="splash-dot"
        count={4}
        index={1}
        label={(n, total) => `Volet ${String(n)} sur ${String(total)}`}
        onSelect={onSelect}
      />,
    );
    const second = screen.getByRole('button', { name: 'Volet 2 sur 4' });
    expect(second.getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('splash-dot-1').getAttribute('aria-current')).toBeNull();
    expect(second.querySelector('span')?.className).toContain('scale-x-250');
    await userEvent.click(screen.getByTestId('splash-dot-3'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('sans onSelect : indicateur seul, position annoncée en texte', () => {
    render(
      <DotPagination count={3} index={0} label={(n, t) => `Volet ${String(n)} sur ${String(t)}`} />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Volet 1 sur 3')).toBeTruthy();
  });
});
