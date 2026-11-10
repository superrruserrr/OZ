import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge.js';
import { MeasureBar } from './measure-bar.js';
import { Skeleton, SkeletonGroup } from './skeleton.js';

// Squelettes (E14), barres de mesure (E12), badge tampon (E13, CP-19).

describe('Skeleton', () => {
  it('conteneur occupé et nommé ; blocs décoratifs avec balayage', () => {
    render(
      <SkeletonGroup label="Chargement" testId="results-loading">
        <Skeleton className="h-4 w-40" />
      </SkeletonGroup>,
    );
    const group = screen.getByTestId('results-loading');
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status', { name: 'Chargement' })).toBe(group);
    const block = group.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(block.className).toContain('bg-oz-surface-2');
    expect(block.className).toContain('after:animate-oz-shimmer');
  });
});

describe('MeasureBar', () => {
  it('meter nommé, valeur et unité à droite, remplissage par transform', () => {
    render(<MeasureBar label="Vitesse sur 30 m" value={4.2} max={6} unit="s" />);
    const meter = screen.getByRole('meter', { name: 'Vitesse sur 30 m' });
    expect(meter.getAttribute('aria-valuenow')).toBe('4.2');
    expect(meter.getAttribute('aria-valuemax')).toBe('6');
    expect(meter.getAttribute('aria-valuetext')).toBe('4.2 s');
    expect(screen.getByText('4.2 s')).toBeTruthy();
    const fill = screen.getByTestId('measure-bar-fill');
    expect(fill.style.transform).toBe('scaleX(0.7)');
    expect(fill.className).toContain('animate-oz-grow');
  });

  it('décalage de 60 ms par index ; valeur bornée ; texte de valeur fourni', () => {
    render(<MeasureBar label="x" value={12} max={10} index={3} valueText="12 répétitions" />);
    const fill = screen.getByTestId('measure-bar-fill');
    expect(fill.style.animationDelay).toBe('180ms');
    expect(fill.style.transform).toBe('scaleX(1)');
    expect(screen.getByText('12 répétitions')).toBeTruthy();
  });
});

describe('Badge tampon (E13)', () => {
  it('jamais par défaut, ni sans confirmation serveur', () => {
    const { rerender } = render(<Badge tone="verified">Vérifié</Badge>);
    expect(screen.getByTestId('badge-verified').className).not.toContain('animate-oz-stamp');
    rerender(
      <Badge tone="verified" animate>
        Vérifié
      </Badge>,
    );
    expect(screen.getByTestId('badge-verified').className).not.toContain('animate-oz-stamp');
  });

  it('seulement si confirmé et demandé', () => {
    render(
      <Badge tone="verified" confirmed animate>
        Vérifié
      </Badge>,
    );
    expect(screen.getByTestId('badge-verified').className).toContain(
      'motion-safe:animate-oz-stamp',
    );
  });
});
