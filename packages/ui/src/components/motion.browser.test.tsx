import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '../../.storybook/storybook.css';
import { Button } from './button.js';
import { Field } from './field.js';

declare module 'vitest/browser' {
  interface BrowserCommands {
    pressAndHold: (testId: string) => Promise<void>;
    releaseMouse: () => Promise<void>;
  }
}

// Exécuté dans Chromium avec `reducedMotion: 'reduce'` (vitest.storybook.config.ts, projet motion).
const MAX_SECONDS = 0.00001;

function durations(element: Element, pseudo?: string): number[] {
  const style = getComputedStyle(element, pseudo);
  return [style.transitionDuration, style.animationDuration]
    .flatMap((value) => value.split(','))
    .map((value) => Number.parseFloat(value) * (value.trim().endsWith('ms') ? 0.001 : 1));
}

/** Couches d'ombre visibles : Tailwind 4 empile des couches transparentes même sans ombre. */
function visibleShadows(element: Element): string[] {
  const value = getComputedStyle(element).boxShadow;
  if (value === 'none') return [];
  return value.split(/,(?![^(]*\))/).filter((layer) => !/(?:,\s*0|\/\s*0)\)/.test(layer));
}

afterEach(async () => {
  await commands.releaseMouse();
  cleanup();
});

describe('mouvements réduits (E3, E4, E5)', () => {
  it('le média prefers-reduced-motion est bien émulé', () => {
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
  });

  it.each(['primary', 'secondary'] as const)(
    'bouton %s : aucune transition, ni ombre au survol ni mise à l’échelle à l’appui',
    async (variant) => {
      render(
        <Button variant={variant} data-testid="motion-button">
          Continuer
        </Button>,
      );
      const button = screen.getByTestId('motion-button');
      for (const value of [...durations(button), ...durations(button, '::before')]) {
        expect(value).toBeLessThanOrEqual(MAX_SECONDS);
      }
      await userEvent.hover(button);
      expect(visibleShadows(button)).toEqual([]);
      await commands.pressAndHold('motion-button');
      expect(button.matches(':active')).toBe(true);
      expect(getComputedStyle(button).scale).toBe('none');
    },
  );

  it('champ : contour de focus sans transition (repli « contour seul »)', async () => {
    render(<Field id="first-name" label="Prénom" />);
    const input = screen.getByLabelText('Prénom');
    await userEvent.click(input);
    for (const value of durations(input)) expect(value).toBeLessThanOrEqual(MAX_SECONDS);
    expect(getComputedStyle(input).outlineStyle).toBe('solid');
  });
});
