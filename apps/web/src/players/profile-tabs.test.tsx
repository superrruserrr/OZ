import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileTabs, type ProfileSection } from './profile-tabs';

const SECTIONS: ProfileSection[] = ['identity', 'sport', 'physical'].map((id) => ({
  id,
  title: `Titre ${id}`,
  summary: `Résumé ${id}`,
  icon: <svg />,
  content: <p>Contenu {id}</p>,
}));

function motion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce })),
  );
}

describe('ProfileTabs (lot 1.19ch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('contenu en place, sans volet ; section initiale lue dans l’URL', () => {
    render(<ProfileTabs sections={SECTIONS} label="Sections" initialId="sport" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Titre sport' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tabpanel').textContent).toContain('Contenu sport');
  });

  it('clavier : flèches circulaires, Début et Fin ; un seul onglet tabulable ; URL suivie', async () => {
    motion(true);
    const user = userEvent.setup();
    render(<ProfileTabs sections={SECTIONS} label="Sections" initialId="inconnue" />);
    const [first] = screen.getAllByRole('tab');
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    first?.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Titre physical' }));
    expect(window.location.search).toBe('?section=physical');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tabpanel').textContent).toContain('Contenu identity');
    await user.keyboard('{End}{ArrowRight}');
    expect(document.activeElement).toBe(first);
  });

  it('prefers-reduced-motion : aucune animation ; sinon un fondu court', async () => {
    const animate = vi.fn();
    Element.prototype.animate = animate;
    const user = userEvent.setup();
    motion(true);
    const { unmount } = render(<ProfileTabs sections={SECTIONS} label="Sections" />);
    await user.click(screen.getByRole('tab', { name: 'Titre sport' }));
    expect(animate).not.toHaveBeenCalled();
    unmount();
    motion(false);
    render(<ProfileTabs sections={SECTIONS} label="Sections" />);
    await user.click(screen.getByRole('tab', { name: 'Titre sport' }));
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 180 });
  });
});
