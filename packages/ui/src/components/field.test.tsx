import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast.js';
import { ozColors } from '../tokens.js';
import { Field } from './field.js';

describe('Field', () => {
  it('libellé lié au champ, saisie possible', async () => {
    render(<Field id="first-name" label="Prénom" data-testid="onboarding-identity-first-name" />);
    const input = screen.getByLabelText('Prénom');
    expect(input.id).toBe('first-name');
    expect(input.dataset.testid).toBe('onboarding-identity-first-name');
    await userEvent.type(input, 'Awa');
    expect((input as HTMLInputElement).value).toBe('Awa');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('aide reliée par aria-describedby', () => {
    render(<Field id="email" label="Email" hint="Nous ne le partageons pas." />);
    const input = screen.getByLabelText('Email');
    const hint = screen.getByText('Nous ne le partageons pas.');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('erreur : aria-invalid et message relié (avec l’aide)', () => {
    render(
      <Field id="birth-date" label="Date de naissance" hint="JJ/MM/AAAA" error="Date invalide." />,
    );
    const input = screen.getByLabelText('Date de naissance');
    const error = screen.getByText('Date invalide.');
    const hint = screen.getByText('JJ/MM/AAAA');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual([hint.id, error.id]);
  });

  it('méta-info affichée à droite du libellé (« 17 ANS »)', () => {
    render(<Field id="birth" label="Date de naissance" meta="17 ans" />);
    expect(screen.getByText('17 ans')).toBeTruthy();
  });

  it('désactivé : non modifiable', async () => {
    render(<Field id="locked" label="OZ ID" disabled defaultValue="OZ-CM-26-7K4M9Q-3" />);
    const input = screen.getByLabelText<HTMLInputElement>('OZ ID');
    expect(input.disabled).toBe(true);
    await userEvent.type(input, 'x');
    expect(input.value).toBe('OZ-CM-26-7K4M9Q-3');
  });

  it('chargement (vérification en cours) : aria-busy', () => {
    render(<Field id="phone" label="Téléphone" loading />);
    expect(screen.getByLabelText('Téléphone').getAttribute('aria-busy')).toBe('true');
  });

  it('contrastes AA : libellé, saisie et erreur sur le fond du champ', () => {
    expect(contrastRatio(ozColors['text-label'], ozColors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ozColors.text, ozColors['surface-input'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ozColors.danger, ozColors.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
