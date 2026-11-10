import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StepProgress } from './step-progress.js';

// Progression d'étape (design.md §8.6, E7) : ARIA, bornes, retour.

describe('StepProgress', () => {
  it('barre de progression annoncée : valeur, bornes et libellé fourni', () => {
    render(<StepProgress step={2} total={5} label="Étape 2 sur 5" />);
    const bar = screen.getByRole('progressbar', { name: 'Étape 2 sur 5' });
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
    expect(screen.getByTestId('step-progress-counter').textContent).toBe('2 / 5');
  });

  it('remplissage par transform (scaleX), animé en 300 ms', () => {
    render(<StepProgress step={2} total={5} label="x" />);
    const fill = screen.getByTestId('step-progress-fill');
    expect(fill.style.transform).toBe('scaleX(0.4)');
    expect(fill.className).toContain('duration-300');
  });

  it.each([
    [-1, 5, '0', '5'],
    [9, 5, '5', '5'],
    [1, 0, '1', '1'],
    [Number.NaN, 4, '0', '4'],
  ])('valeurs hors bornes ramenées : step %s, total %s', (step, total, now, max) => {
    render(<StepProgress step={step} total={total} label="x" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe(now);
    expect(bar.getAttribute('aria-valuemax')).toBe(max);
  });

  it('bouton retour facultatif, avec libellé accessible', async () => {
    const onBack = vi.fn();
    const { rerender } = render(<StepProgress step={1} total={3} label="x" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<StepProgress step={1} total={3} label="x" backLabel="Retour" onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.getByTestId('step-progress-back')).toBeTruthy();
  });
});
