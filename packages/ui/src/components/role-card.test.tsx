import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoleCard } from './role-card.js';

describe('RoleCard', () => {
  it('un lien par carte, nommé par le rôle, étiré sur toute la ligne', () => {
    render(<RoleCard href="/auth/role" title="Je suis joueur" subtitle="Mon OZ ID vérifié" />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    // Nom = texte visible, rôle d'abord (WCAG 2.5.3) ; cible ≥ 44 px (2.5.8, lot 1.5cba).
    const link = screen.getByRole('link', { name: /^Je suis joueur/ });
    expect(link.className).toContain('min-h-11');
    expect(link.className).toContain('after:inset-0');
    expect(screen.getByTestId('role-card-player').textContent).toContain('Mon OZ ID vérifié');
  });

  it.each([
    ['player', 'text-oz-primary'],
    ['organization', 'text-oz-primary'],
    ['recruiter', 'text-oz-primary'],
    ['guardian', 'text-oz-legal-icon'],
  ] as const)('rôle %s : couleur de rôle %s (design.md §8.4 n° 5)', (tone, cls) => {
    render(<RoleCard href="/x" title="T" subtitle="S" tone={tone} />);
    expect(
      screen.getByTestId(`role-card-${tone}`).querySelector('[aria-hidden="true"]')?.className,
    ).toContain(cls);
  });
});
