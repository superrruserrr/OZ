import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './select.js';

const POSITIONS = [
  { value: 'goalkeeper', label: 'Gardien' },
  { value: 'defender', label: 'Défenseur' },
  { value: 'forward', label: 'Attaquant', disabled: true },
];

describe('Select', () => {
  it('libellé lié, choix au clavier, valeur transmise', async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        id="position"
        label="Poste"
        placeholder="Choisir"
        options={POSITIONS}
        onValueChange={onValueChange}
        data-testid="onboarding-physical-position"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Poste' });
    expect(trigger.dataset.testid).toBe('onboarding-physical-position');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(await screen.findByRole('option', { name: 'Défenseur' }));
    expect(onValueChange).toHaveBeenCalledWith('defender');
  });

  it('option désactivée non sélectionnable', async () => {
    render(<Select id="p" label="Poste" options={POSITIONS} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Poste' }));
    const option = await screen.findByRole('option', { name: 'Attaquant' });
    expect(option.getAttribute('aria-disabled')).toBe('true');
  });

  it('erreur : aria-invalid et message relié', () => {
    render(<Select id="p" label="Poste" options={POSITIONS} error="Choisissez un poste." />);
    const trigger = screen.getByRole('combobox', { name: 'Poste' });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe(
      screen.getByText('Choisissez un poste.').id,
    );
  });

  it('désactivé : ne s’ouvre pas', async () => {
    render(<Select id="p" label="Poste" options={POSITIONS} disabled />);
    const trigger = screen.getByRole('combobox', { name: 'Poste' });
    expect(trigger).toHaveProperty('disabled', true);
    await userEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
