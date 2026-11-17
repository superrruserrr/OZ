import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthHeading } from './auth-heading';

describe('titre des écrans de compte (lot 1.5cbb)', () => {
  it('libellé à puce, titre de niveau 1 et accroche', () => {
    render(<AuthHeading kicker="Espace membre" title="Se connecter" lead="Bon retour." />);
    expect(screen.getByTestId('kicker').textContent).toBe('Espace membre');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Se connecter');
    expect(screen.getByText('Bon retour.')).toBeTruthy();
  });

  it('sans accroche, aucun paragraphe vide', () => {
    const { container } = render(<AuthHeading kicker="Inscription" title="Titre" />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});
