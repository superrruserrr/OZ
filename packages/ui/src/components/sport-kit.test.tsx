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

describe('SportLoader', () => {
  it('statut annoncé poliment, animation décorative', () => {
    render(<SportLoader label="Chargement de la page" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-label')).toBe('Chargement de la page');
    expect(status.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(status.querySelector('[style]')).toBeNull();
  });

  it('balle du sport choisi', () => {
    render(<SportLoader label="Chargement" sport="basketball" />);
    expect(screen.getByRole('status').dataset.sport).toBe('basketball');
  });
});
