import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClubCrest, crestInitials, crestPalette } from './club-crest.js';
import { SPORTS, SportIcon, SportTag } from './sport-icon.js';
import { SportLoader } from './sport-loader.js';

describe('SportIcon (lot 1.5da)', () => {
  it('un dessin distinct par sport', () => {
    const paths = SPORTS.map((sport) => {
      const { container, unmount } = render(<SportIcon sport={sport} />);
      const d = container.querySelector('svg')?.innerHTML ?? '';
      unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(SPORTS.length);
  });

  it('décorative par défaut, nommée quand un titre est donné', () => {
    const { container, rerender } = render(<SportIcon sport="tennis" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<SportIcon sport="tennis" title="Tennis" />);
    expect(screen.getByRole('img', { name: 'Tennis' })).toBeTruthy();
  });

  it('pastille de sport : icône et nom lisible', () => {
    render(<SportTag sport="basketball" label="Basket" />);
    expect(screen.getByTestId('sport-tag-basketball').textContent).toBe('Basket');
  });
});

describe('ClubCrest', () => {
  it('initiales tirées du nom, deux lettres au plus', () => {
    expect(crestInitials('Faith for Life Academy')).toBe('FL');
    expect(crestInitials('Dolphin')).toBe('DO');
    expect(crestInitials('AS Nylon de Douala')).toBe('AN');
  });

  it('couleurs stables pour un même nom, jamais un logo réel', () => {
    expect(crestPalette('Club A')).toEqual(crestPalette('Club A'));
    render(<ClubCrest name="Union Sportive de Test" />);
    const crest = screen.getByRole('img', { name: 'Écusson générique : Union Sportive de Test' });
    expect(crest.querySelector('text')?.textContent).toBe('US');
    expect(crest.querySelector('image, [style]')).toBeNull();
  });
});

describe('SportLoader (lot 1.5e, E5)', () => {
  it('statut annoncé poliment, animation décorative, sans attribut style (CSP)', () => {
    render(<SportLoader label="Chargement de la page" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-label')).toBe('Chargement de la page');
    expect(status.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(status.querySelector('[style]')).toBeNull();
  });

  it('l’anneau OZ éclate en trois balles : football, basket, tennis par défaut', () => {
    render(<SportLoader label="Chargement" />);
    const status = screen.getByRole('status');
    expect(status.querySelector('[data-part="ring"]')).not.toBeNull();
    const balls = [...status.querySelectorAll<SVGElement>('[data-ball]')].map(
      (b) => b.dataset.ball,
    );
    expect(balls).toEqual(['football', 'basketball', 'tennis']);
  });

  it('sports choisis', () => {
    render(<SportLoader label="Chargement" sports={['rugby', 'handball', 'volleyball']} />);
    expect(screen.getByRole('status').dataset.sports).toBe('rugby handball volleyball');
  });

  it('n’apparaît qu’après un court délai et ne prend pas tout l’écran', () => {
    render(<SportLoader label="Chargement" />);
    const status = screen.getByRole('status');
    expect(status.className).toContain('animate-oz-loader-appear');
    expect(status.className).not.toContain('dvh');
  });

  it('mouvement réduit : seul l’anneau fixe reste, les balles ne bougent qu’en motion-safe', () => {
    render(<SportLoader label="Chargement" />);
    const status = screen.getByRole('status');
    const ring = status.querySelector('[data-part="ring"]');
    expect(ring?.getAttribute('class')).toContain('motion-safe:animate-oz-ring-burst');
    for (const ball of status.querySelectorAll('[data-ball]')) {
      const cls = ball.getAttribute('class') ?? '';
      expect(cls).toContain('opacity-0');
      expect(cls).toMatch(/motion-safe:animate-oz-split-(left|center|right)/);
    }
  });
});
