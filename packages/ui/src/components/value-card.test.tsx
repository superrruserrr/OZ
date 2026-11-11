import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ValueCard, type CardLinkProps } from './value-card.js';

describe('ValueCard', () => {
  it('un seul lien : le titre (nom = texte visible), étiré sur toute la carte', () => {
    render(
      <ValueCard href="/profils/joueur" title="Identité vérifiée" cta="Découvrir" icon={<svg />}>
        Un OZ ID unique par joueur.
      </ValueCard>,
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const link = screen.getByRole('link', { name: 'Identité vérifiée' });
    expect(link.getAttribute('href')).toBe('/profils/joueur');
    expect(link.className).toContain('after:inset-0');
    expect(screen.getByRole('heading', { level: 3, name: 'Identité vérifiée' })).toBeTruthy();
    expect(screen.getByTestId('value-card').textContent).toContain('Un OZ ID unique par joueur.');
  });

  it('atteignable au clavier, survol en motion-safe seulement', async () => {
    render(
      <ValueCard href="/a" title="A" cta="Voir">
        Texte
      </ValueCard>,
    );
    await userEvent.tab();
    const link = screen.getByRole('link', { name: 'A' });
    expect(document.activeElement).toBe(link);
    expect(screen.getByTestId('value-card').className).toContain(
      'motion-safe:hover:-translate-y-0.5',
    );
  });

  it('utilise le composant de lien de l’application', () => {
    const AppLink = ({ children, ...rest }: CardLinkProps) => (
      <a data-router="" {...rest}>
        {children}
      </a>
    );
    render(
      <ValueCard href="/b" title="B" cta="Voir" linkComponent={AppLink}>
        Texte
      </ValueCard>,
    );
    expect(screen.getByRole('link', { name: 'B' }).hasAttribute('data-router')).toBe(true);
  });
});
