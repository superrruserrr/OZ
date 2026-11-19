import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttributeRadar, radarPoint } from './attribute-radar.js';
import { GaugeDial } from './gauge-dial.js';
import { HudFrame } from './hud-frame.js';
import { MeasureBar } from './measure-bar.js';

const AXES = [
  { key: 'identity', label: 'Identité', value: 100, valueText: '100 %' },
  { key: 'sport', label: 'Sport', value: 50, valueText: '50 %' },
  { key: 'physical', label: 'Physique', value: 0, valueText: '0 %' },
  { key: 'media', label: 'Médias', value: 25, valueText: '25 %' },
  { key: 'verification', label: 'Vérification', value: 75, valueText: '75 %' },
  { key: 'guardian', label: 'Tuteur', value: 100, valueText: '100 %' },
] as const;

describe('AttributeRadar (lot 1.5eb, E4)', () => {
  it('hexagone nommé, un sommet par axe, valeurs lisibles en texte', () => {
    render(<AttributeRadar label="Complétude du profil" axes={AXES} />);
    const figure = screen.getByRole('figure', { name: 'Complétude du profil' });
    const values = figure.querySelector('[data-part="values"]');
    expect(values?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(6);
    const legend = within(figure).getByRole('list');
    expect(within(legend).getAllByRole('listitem')).toHaveLength(6);
    expect(legend.textContent).toContain('Sport');
    expect(legend.textContent).toContain('50 %');
    expect(figure.querySelector('[style]')).toBeNull();
  });

  it('premier axe en haut, sommets bornés au rayon', () => {
    const [x, y] = radarPoint(0, 6, 1);
    expect(x).toBeCloseTo(100);
    expect(y).toBeLessThan(100);
    const [x2, y2] = radarPoint(0, 6, 2);
    expect([x2, y2]).toEqual(radarPoint(0, 6, 1));
  });

  it('sans aucune donnée : état vide, pas de polygone, jamais de valeur inventée', () => {
    render(
      <AttributeRadar
        label="Aptitudes"
        emptyText="En attente de mesures certifiées"
        axes={AXES.map((axis) => ({ key: axis.key, label: axis.label, value: null }))}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Aptitudes' });
    expect(figure.dataset.state).toBe('empty');
    expect(figure.querySelector('[data-part="values"]')).toBeNull();
    expect(figure.textContent).toContain('En attente de mesures certifiées');
    expect(figure.textContent).not.toMatch(/\d/);
  });

  it('moins de trois axes : rien n’est dessiné', () => {
    const { container } = render(
      <AttributeRadar label="X" axes={[{ key: 'a', label: 'A', value: 1 }]} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('GaugeDial (lot 1.5eb)', () => {
  it('jauge annoncée comme mesure, arc proportionnel', () => {
    render(<GaugeDial label="Profil complété" value={60} valueText="60 %" />);
    const meter = screen.getByRole('meter', { name: 'Profil complété' });
    expect(meter.getAttribute('aria-valuenow')).toBe('60');
    expect(meter.getAttribute('aria-valuetext')).toBe('60 %');
    expect(meter.querySelector('[data-part="arc"]')?.getAttribute('stroke-dasharray')).toBe(
      '60 100',
    );
  });

  it('valeur absente : état vide, aucune mesure annoncée', () => {
    render(<GaugeDial label="Vitesse" value={null} emptyText="Bientôt disponible" />);
    expect(screen.queryByRole('meter')).toBeNull();
    const gauge = screen.getByTestId('gauge-dial');
    expect(gauge.dataset.state).toBe('empty');
    expect(gauge.querySelector('[data-part="arc"]')).toBeNull();
    expect(gauge.textContent).toContain('Bientôt disponible');
  });
});

describe('HudFrame (lot 1.5eb)', () => {
  it('titre, contenu, coins et illustration décoratifs', () => {
    render(
      <HudFrame title="Profil" kicker="Données" illustration="pitch">
        <p>Contenu</p>
      </HudFrame>,
    );
    const frame = screen.getByRole('region', { name: 'Profil' });
    expect(within(frame).getByText('Contenu')).toBeTruthy();
    const deco = frame.querySelectorAll('[aria-hidden="true"]');
    expect(deco.length).toBeGreaterThanOrEqual(2);
    expect(frame.querySelector('[data-illustration="pitch"]')).not.toBeNull();
  });
});

describe('MeasureBar segmentée (lot 1.5eb)', () => {
  it('neuf crans décoratifs', () => {
    render(<MeasureBar label="Taille" value={180} max={220} unit="cm" segmented />);
    const meter = screen.getByRole('meter', { name: 'Taille' });
    expect(meter.querySelectorAll('[data-part="notch"]')).toHaveLength(9);
  });
});
