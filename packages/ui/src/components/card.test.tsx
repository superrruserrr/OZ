import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Card } from './card.js';

describe('Card', () => {
  it('carte statique : simple conteneur, pas de rôle bouton', () => {
    render(<Card data-testid="card-summary">Contenu</Card>);
    expect(screen.getByTestId('card-summary').tagName).toBe('DIV');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('carte interactive : bouton activable au clavier, sélection annoncée', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <Card interactive selected={false} onSelect={onSelect} data-testid="card-role-defender">
        Défenseur
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Défenseur' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(card.dataset.state).toBe('idle');
    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);

    rerender(
      <Card interactive selected onSelect={onSelect} data-testid="card-role-defender">
        Défenseur
      </Card>,
    );
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(card.dataset.state).toBe('selected');
  });

  it('carte interactive désactivée : aucun choix possible', async () => {
    const onSelect = vi.fn();
    render(
      <Card interactive disabled onSelect={onSelect}>
        Gardien
      </Card>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gardien' }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
