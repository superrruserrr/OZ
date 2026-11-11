import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PitchPositions,
  RingChart,
  SERIES_TONES,
  Sparkline,
  StatTile,
  sparklinePoints,
} from './stats.js';

describe('sparklinePoints', () => {
  it('normalise la série dans la boîte, axe vertical inversé', () => {
    expect(sparklinePoints([0, 5, 10], 80, 24)).toEqual([
      [0, 24],
      [40, 12],
      [80, 0],
    ]);
  });

  it('ignore les valeurs non finies et tolère une série plate', () => {
    expect(sparklinePoints([Number.NaN, 3, 3], 80, 24)).toEqual([
      [0, 24],
      [80, 24],
    ]);
  });
});

describe('Sparkline', () => {
  it('décorative : masquée aux lecteurs d’écran, rien sous deux points', () => {
    const { container, rerender } = render(<Sparkline values={[1, 3, 2]} />);
    expect(screen.getByTestId('sparkline').getAttribute('aria-hidden')).toBe('true');
    rerender(<Sparkline values={[1]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('StatTile', () => {
  it('dit le libellé, la valeur et la variation en texte', () => {
    render(<StatTile label="Vues recruteurs" value="[n]" delta="[+n] %" trend={[1, 2, 3]} />);
    const tile = screen.getByTestId('stat-tile');
    expect(tile.textContent).toContain('Vues recruteurs');
    expect(tile.textContent).toContain('[n]');
    expect(tile.textContent).toContain('[+n] %');
  });
});

describe('RingChart', () => {
  const segments = [
    { label: 'Équipe A', value: 32 },
    { label: 'Réserve', value: 46 },
    { label: 'Formation', value: 18 },
  ];

  it('anneau nommé, chaque valeur lisible dans la légende', () => {
    render(<RingChart label="Répartition par équipe" segments={segments} totalLabel="joueurs" />);
    expect(screen.getByRole('img', { name: 'Répartition par équipe' })).toBeTruthy();
    const items = [...screen.getByTestId('ring-chart').querySelectorAll('li')].map(
      (li) => li.textContent,
    );
    expect(items).toEqual(['Équipe A32', 'Réserve46', 'Formation18']);
  });

  it('séries dans l’ordre lime, bleu, ambre (ADR-012) et arcs qui font le tour', () => {
    const { container } = render(<RingChart label="R" segments={segments} />);
    const arcs = [...container.querySelectorAll('circle')].slice(1);
    expect(arcs.map((c) => c.getAttribute('class'))).toEqual([
      'stroke-oz-primary',
      'stroke-oz-highlight',
      'stroke-oz-kyc',
    ]);
    const total = arcs.reduce(
      (sum, c) => sum + Number((c.getAttribute('stroke-dasharray') ?? '0').split(' ')[0]),
      0,
    );
    expect(total).toBeCloseTo(100, 0);
    expect(SERIES_TONES).toEqual(['primary', 'highlight', 'kyc', 'muted']);
  });
});

describe('PitchPositions', () => {
  it('schéma décoratif, postes dits en texte', () => {
    render(
      <PitchPositions
        title="Postes occupés"
        primary="CB"
        secondary={['RB']}
        labels={{ primary: 'Défenseur central', secondary: ['Latéral droit'] }}
      />,
    );
    const figure = screen.getByTestId('pitch-positions');
    expect(figure.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(figure.textContent).toContain('Défenseur central');
    expect(figure.textContent).toContain('Latéral droit');
  });
});

describe('statistiques : CSP et règles du plan', () => {
  it('aucun attribut style, aucune note de joueur', () => {
    const { container } = render(
      <>
        <StatTile label="Joueurs" value="[n]" trend={[1, 2]} />
        <RingChart label="R" segments={[{ label: 'A', value: 1 }]} />
        <PitchPositions title="Postes" primary="ST" labels={{ primary: 'Avant-centre' }} />
      </>,
    );
    expect(container.querySelector('[style]')).toBeNull();
    expect(container.textContent).not.toMatch(/score|index|note/i);
  });
});
