import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast.js';
import { ozThemes } from '../tokens.js';
import { Kicker, SplitHeading, SPLIT_HEADING_MIN_PX } from './sport.js';

describe('Kicker', () => {
  it('libellé en majuscules espacées, puce décorative', () => {
    render(<Kicker>Identité football vérifiée</Kicker>);
    const kicker = screen.getByTestId('kicker');
    expect(kicker.textContent).toBe('Identité football vérifiée');
    expect(kicker.className).toContain('uppercase');
    expect(kicker.className).toContain('tracking-[0.08em]');
    expect(kicker.querySelector('[aria-hidden="true"]')?.className).toContain('bg-oz-primary');
  });

  it('la puce suit le ton demandé', () => {
    render(<Kicker tone="highlight">Réseau</Kicker>);
    const dot = screen.getByTestId('kicker').querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-oz-highlight');
  });
});

describe('SplitHeading', () => {
  it('rend le niveau demandé, la fin de phrase en rose accent', () => {
    render(<SplitHeading as="h1" lead="Ton talent," highlight="notre mission." />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Ton talent, notre mission.');
    const em = heading.querySelector('em');
    expect(em?.textContent).toBe('notre mission.');
    expect(em?.className).toContain('text-oz-accent');
  });

  it('h2 par défaut, sans segment rose si aucun highlight', () => {
    render(<SplitHeading lead="Une identité vérifiée" />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.querySelector('em')).toBeNull();
  });

  it.each(['hero', 'section'] as const)(
    'taille %s : jamais sous 24 px, le rose reste du grand texte (design.md §8.3)',
    (size) => {
      render(<SplitHeading size={size} lead="A" highlight="B" />);
      expect(SPLIT_HEADING_MIN_PX[size]).toBeGreaterThanOrEqual(24);
      expect(screen.getByRole('heading').className).toContain(
        `text-[clamp(${String(SPLIT_HEADING_MIN_PX[size] / 16)}rem`,
      );
    },
  );

  it('le rose atteint 3:1 sur le fond et les surfaces sombres (grand texte)', () => {
    const c = ozThemes.dark;
    for (const bg of [c.bg, c['surface-1']]) {
      expect(contrastRatio(c.accent, bg)).toBeGreaterThanOrEqual(3);
    }
  });
});
