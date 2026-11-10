import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingChip, GlassPanel, Halo, OzIdReveal, PitchCircles } from './emotion.js';

// Effets d'émotion (lot 1.5bb, design.md §8.7) : E1, E2, E16, E18, E20.

describe('Halo (E1)', () => {
  it('halo décoratif derrière son contenu, respiration lente coupée avec mouvement réduit', () => {
    render(
      <Halo>
        <p>Carte</p>
      </Halo>,
    );
    const glow = screen.getByTestId('halo-glow');
    expect(glow.getAttribute('aria-hidden')).toBe('true');
    expect(glow.className).toContain('motion-safe:animate-oz-breathe');
    expect(screen.getByText('Carte')).toBeTruthy();
  });
});

describe('OzIdReveal (E2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('OZ ID complet pour les lecteurs d’écran dès le départ ; frappe visuelle à 40 ms par caractère', () => {
    render(<OzIdReveal ozId="OZ-CM-26-7K4M9Q-3" />);
    expect(screen.getByTestId('oz-id-reveal-full').textContent).toBe('OZ-CM-26-7K4M9Q-3');
    const typed = screen.getByTestId('oz-id-reveal-typed');
    expect(typed.getAttribute('aria-hidden')).toBe('true');
    expect(typed.textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(500 + 40 * 5);
    });
    expect(typed.textContent).toBe('OZ-CM');
    act(() => {
      vi.advanceTimersByTime(40 * 20);
    });
    expect(typed.textContent).toBe('OZ-CM-26-7K4M9Q-3');
  });

  it('mouvement réduit : affichage direct', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render(<OzIdReveal ozId="OZ-CM-26-7K4M9Q-3" />);
    expect(screen.getByTestId('oz-id-reveal-typed').textContent).toBe('OZ-CM-26-7K4M9Q-3');
    vi.unstubAllGlobals();
  });
});

describe('PitchCircles (E16), GlassPanel (E18), FloatingChip (E20)', () => {
  it('cercles du terrain décoratifs, rotation imperceptible coupée avec mouvement réduit', () => {
    const { container } = render(<PitchCircles />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toContain('motion-safe:animate-oz-spin-slow');
  });

  it('verre dépoli : repli opaque surface-1 sans backdrop-filter', () => {
    render(<GlassPanel testId="glass">Pourquoi OZ</GlassPanel>);
    const panel = screen.getByTestId('glass');
    expect(panel.className).toContain('bg-oz-surface-1');
    expect(panel.className).toContain('supports-backdrop-filter:motion-safe:backdrop-blur-lg');
  });

  it('puce pays flottante : déphasage par index, flottement coupé avec mouvement réduit', () => {
    render(<FloatingChip index={2}>Cameroun</FloatingChip>);
    const chip = screen.getByText('Cameroun').closest('span[data-floating]') as HTMLElement;
    expect(chip.className).toContain('motion-safe:animate-oz-float');
    expect(chip.style.animationDelay).toBe('-2000ms');
  });
});
