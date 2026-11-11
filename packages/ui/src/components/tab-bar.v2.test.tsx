import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabBar } from './tab-bar.js';

describe('TabBar v2 (lot 1.5ca)', () => {
  it('fond vitré, marge de la zone sûre, indicateur sur l’onglet actif seulement', () => {
    render(
      <TabBar
        label="Navigation"
        activeId="home"
        items={[
          { id: 'home', label: 'Accueil', href: '/' },
          { id: 'more', label: 'Plus', href: '/plus' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(nav.className).toContain('backdrop-blur');
    expect(screen.getByTestId('tab-home').querySelector('[data-indicator]')).toBeTruthy();
    expect(screen.getByTestId('tab-more').querySelector('[data-indicator]')).toBeNull();
  });
});
