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
