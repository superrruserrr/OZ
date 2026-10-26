import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactForm } from './contact-form.js';

async function fill(
  overrides: Partial<Record<'name' | 'email' | 'message', string>> = {},
): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('contact-form-name'), overrides.name ?? 'Éliot Moukoko');
  await user.type(screen.getByTestId('contact-form-email'), overrides.email ?? 'eliot@exemple.cm');
  await user.selectOptions(screen.getByTestId('contact-form-organisation-type'), 'academy');
  await user.type(
    screen.getByTestId('contact-form-message'),
    overrides.message ?? 'Notre académie souhaite rejoindre OZ.',
  );
  await user.click(screen.getByTestId('contact-form-consent'));
  await user.click(screen.getByTestId('contact-form-submit'));
}

describe('ContactForm — validation C1 (EX-005 n° 2)', () => {
  it('affiche l’erreur sous le champ et n’envoie rien si l’email est invalide', async () => {
    const onSubmit = vi.fn<(values: unknown) => Promise<void>>().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await fill({ email: 'eliot' });
    expect((await screen.findByTestId('contact-form-email-error')).textContent).toBe(
      'validation.email.invalid',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envoie exactement les champs du schéma, normalisés', async () => {
    const onSubmit = vi.fn<(values: unknown) => Promise<void>>().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await fill({ email: 'ELIOT@Exemple.CM' });
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Éliot Moukoko',
      email: 'eliot@exemple.cm',
      organisationType: 'academy',
      message: 'Notre académie souhaite rejoindre OZ.',
      consent: true,
    });
  });
});

describe('ContactForm — accessibilité des erreurs (revue tour 1)', () => {
  it('relie chaque contrôle en erreur à son message (aria-invalid + aria-describedby)', async () => {
    render(<ContactForm onSubmit={() => Promise.resolve()} />);
    await userEvent.setup().click(screen.getByTestId('contact-form-submit'));
    for (const id of [
      'contact-form-name',
      'contact-form-email',
      'contact-form-organisation-type',
      'contact-form-message',
      'contact-form-consent',
    ]) {
      const control = await screen.findByTestId(id);
      expect(control.getAttribute('aria-invalid'), id).toBe('true');
      expect(control.getAttribute('aria-describedby'), id).toBe(`${id}-error`);
      expect(screen.getByTestId(`${id}-error`).id).toBe(`${id}-error`);
    }
  });
});
