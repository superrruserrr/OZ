import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { contrastRatio } from '../contrast.js';
import { OZ_MODES, ozThemes } from '../tokens.js';
import { Button } from './button.js';

describe('Button', () => {
  it('bouton principal actif : dégradé allumé, clic transmis', async () => {
    const onClick = vi.fn();
    render(
      <Button data-testid="demo-submit" onClick={onClick}>
        Continuer
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Continuer' });
    expect(button).toHaveProperty('type', 'button');
    expect(button.dataset.variant).toBe('primary');
    expect(button.dataset.state).toBe('active');
    expect(button.dataset.testid).toBe('demo-submit');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('désactivé : fond plat (état inactif), aucun clic (design.md §8.4 n° 1)', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Vérifier
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Vérifier' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.dataset.state).toBe('inactive');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('chargement : aria-busy, inactif, libellé conservé pour les lecteurs d’écran', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Envoyer
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Envoyer' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.dataset.state).toBe('inactive');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('secondaire : variante distincte, jamais le dégradé', () => {
    render(<Button variant="secondary">Retour</Button>);
    expect(screen.getByRole('button', { name: 'Retour' }).dataset.variant).toBe('secondary');
  });

  it('halo (glow) : marqué, et seulement sur un bouton actif', () => {
    const { rerender } = render(<Button glow>Créer un compte</Button>);
    const button = screen.getByRole('button', { name: 'Créer un compte' });
    expect(button.dataset.glow).toBe('true');
    expect(button.className).toContain('data-[state=active]:motion-safe:shadow-');
    rerender(
      <Button glow disabled>
        Créer un compte
      </Button>,
    );
    expect(button.dataset.state).toBe('inactive');
  });

  it('contour sombre : variante outline, sans dégradé', () => {
    render(<Button variant="outline">Voir les tarifs</Button>);
    const button = screen.getByRole('button', { name: 'Voir les tarifs' });
    expect(button.dataset.variant).toBe('outline');
    expect(button.className).toContain('border-oz-text/20');
    expect(button.className).not.toContain('before:from-oz-primary-from');
  });

  it('la flèche finale glisse au survol (icône marquée data-arrow)', () => {
    render(
      <Button>
        Continuer <svg data-arrow="" />
      </Button>,
    );
    expect(screen.getByRole('button').className).toContain('[&_[data-arrow]]:transition-transform');
  });

  it('asChild : rend l’élément enfant (lien) avec le style du bouton', () => {
    render(
      <Button asChild>
        <a href="/inscription">S’inscrire</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'S’inscrire' });
    expect(link.getAttribute('href')).toBe('/inscription');
    expect(link.dataset.variant).toBe('primary');
  });

  it.each(OZ_MODES)(
    'contrastes AA (%s) : texte on-primary sur les deux bouts du dégradé',
    (mode) => {
      const c = ozThemes[mode];
      expect(contrastRatio(c['on-primary'], c['primary-from'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c['on-primary'], c['primary-to'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
