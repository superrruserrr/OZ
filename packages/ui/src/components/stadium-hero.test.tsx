import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast.js';
import { ozThemes } from '../tokens.js';
import { STADIUM_GLOWS, StadiumHero } from './stadium-hero.js';

/** Couleur `top` posée à `alpha` sur `bottom` (hex), rendue en hex. */
function blend(top: string, bottom: string, alpha: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(top, i) * alpha + channel(bottom, i) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('StadiumHero', () => {
  it('rend le texte et le panneau, le décor est caché aux lecteurs d’écran', () => {
    render(<StadiumHero copy={<h1>Ton talent</h1>} aside={<p>Panneau</p>} />);
    const hero = screen.getByTestId('stadium-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { name: 'Ton talent' })).toBeTruthy();
    expect(screen.getByText('Panneau')).toBeTruthy();
    const decor = screen.getByTestId('stadium-hero-decor');
    expect(decor.getAttribute('aria-hidden')).toBe('true');
  });

  it('le panneau passe sous le texte avant 1024 px : deux colonnes seulement en lg', () => {
    render(<StadiumHero copy={<p>Texte</p>} aside={<p>Panneau</p>} />);
    const grid = screen.getByTestId('stadium-hero-grid');
    expect(grid.className).toMatch(/\blg:grid-cols-/);
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-/);
    expect(grid.className).toContain('min-w-0');
  });

  it('sans photo : aucun <img>, décor dessiné ; une photo fournie va dans le décor (D-129)', () => {
    const { rerender } = render(<StadiumHero copy={<p>Texte</p>} />);
    expect(screen.getByTestId('stadium-hero-decor').querySelector('img')).toBeNull();
    rerender(<StadiumHero copy={<p>Texte</p>} media={<img src="/stade.avif" alt="" />} />);
    expect(screen.getByTestId('stadium-hero-decor').querySelector('img')).toBeTruthy();
  });

  it('texte lisible au point le plus lumineux, faisceaux superposés (AA, EX-T22)', () => {
    const c = ozThemes.dark;
    const stacked = (['primary', 'highlight', 'accent'] as const).reduce<string>(
      (under, glow) => blend(c[glow], under, STADIUM_GLOWS[glow]),
      c.bg,
    );
    for (const fg of ['text', 'text-muted', 'text-label'] as const) {
      expect(contrastRatio(c[fg], stacked), fg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('les faisceaux rendus utilisent exactement les opacités testées', () => {
    render(<StadiumHero copy={<p>Texte</p>} />);
    const html = screen.getByTestId('stadium-hero-decor').innerHTML;
    for (const [glow, opacity] of Object.entries(STADIUM_GLOWS)) {
      expect(html).toContain(`var(--oz-${glow})_${String(Math.round(opacity * 100))}%`);
    }
  });

  it('toute animation du décor est réservée à motion-safe', () => {
    render(<StadiumHero copy={<p>Texte</p>} />);
    for (const element of screen
      .getByTestId('stadium-hero')
      .querySelectorAll('[class*="animate-"]')) {
      for (const token of String(element.getAttribute('class')).split(/\s+/)) {
        if (token.includes('animate-')) expect(token).toMatch(/^motion-safe:/);
      }
    }
  });
});
