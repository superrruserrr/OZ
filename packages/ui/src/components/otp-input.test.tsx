import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput, type OtpInputProps } from './otp-input.js';

// Code à 6 chiffres (écran 04, E8) : saisie, collage, retour arrière, appel unique, erreur, renvoi.

function setup(props: Partial<OtpInputProps> = {}) {
  const onComplete = vi.fn();
  render(
    <OtpInput
      id="otp"
      testId="auth-otp"
      label="Code reçu par SMS"
      digitLabel={(n, total) => `Chiffre ${String(n)} sur ${String(total)}`}
      onComplete={onComplete}
      {...props}
    />,
  );
  const digits = Array.from({ length: 6 }, (_, i) =>
    screen.getByTestId<HTMLInputElement>(`auth-otp-digit-${String(i + 1)}`),
  );
  return { onComplete, digits };
}

describe('OtpInput', () => {
  it('groupe nommé, 6 cases annoncées, clavier numérique, autocomplétion du code', () => {
    const { digits } = setup();
    expect(screen.getByRole('group', { name: 'Code reçu par SMS' })).toBeTruthy();
    expect(digits[2]?.getAttribute('aria-label')).toBe('Chiffre 3 sur 6');
    for (const digit of digits) expect(digit.inputMode).toBe('numeric');
    expect(digits[0]?.autocomplete).toBe('one-time-code');
  });

  it('chiffres seuls, passage automatique, appel unique à la fin', async () => {
    const { digits, onComplete } = setup();
    await userEvent.click(screen.getByTestId('auth-otp-digit-1'));
    await userEvent.keyboard('1a2');
    expect(digits.map((d) => d.value).join('')).toBe('12');
    expect(document.activeElement).toBe(digits[2]);
    await userEvent.keyboard('3456');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
    await userEvent.keyboard('6');
    expect(onComplete).toHaveBeenCalledOnce();
    await userEvent.keyboard('7');
    expect(onComplete).toHaveBeenLastCalledWith('123457');
  });

  it('retour arrière sur une case vide : efface et revient à la précédente', async () => {
    const { digits } = setup();
    await userEvent.click(screen.getByTestId('auth-otp-digit-1'));
    await userEvent.keyboard('12');
    await userEvent.keyboard('{Backspace}');
    expect(document.activeElement).toBe(digits[1]);
    expect(digits[1]?.value).toBe('');
    await userEvent.keyboard('{Backspace}');
    expect(document.activeElement).toBe(digits[0]);
    expect(digits[0]?.value).toBe('');
  });

  it('collage d’un code complet, même avec des espaces', () => {
    const { digits, onComplete } = setup();
    fireEvent.paste(digits[0] as HTMLInputElement, {
      clipboardData: { getData: () => '12 34 56' },
    });
    expect(digits.map((d) => d.value).join('')).toBe('123456');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it('nouvel appel après correction d’un chiffre', async () => {
    const { digits, onComplete } = setup();
    fireEvent.paste(digits[0] as HTMLInputElement, { clipboardData: { getData: () => '123456' } });
    await userEvent.click(screen.getByTestId('auth-otp-digit-6'));
    await userEvent.keyboard('{Backspace}9');
    expect(onComplete).toHaveBeenLastCalledWith('123459');
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('erreur : cases invalides, message relié, secousse', () => {
    const { digits } = setup({ error: 'Code incorrect' });
    for (const digit of digits) {
      expect(digit.getAttribute('aria-invalid')).toBe('true');
      expect(digit.getAttribute('aria-describedby')).toBe('otp-error');
    }
    expect(screen.getByText('Code incorrect').id).toBe('otp-error');
    expect(screen.getByTestId('auth-otp').className).toContain('animate-oz-shake');
  });

  it('renvoi piloté par l’appelant : désactivé pendant le décompte', async () => {
    const onResend = vi.fn();
    const { rerender } = render(
      <OtpInput
        id="o2"
        testId="o2"
        label="Code"
        digitLabel={(n) => String(n)}
        onComplete={() => undefined}
        resendLabel="Renvoyer dans 42 s"
        resendDisabled
        onResend={onResend}
      />,
    );
    const resend = screen.getByRole('button', { name: 'Renvoyer dans 42 s' });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <OtpInput
        id="o2"
        testId="o2"
        label="Code"
        digitLabel={(n) => String(n)}
        onComplete={() => undefined}
        resendLabel="Renvoyer le code"
        onResend={onResend}
      />,
    );
    await userEvent.click(screen.getByTestId('o2-resend'));
    expect(onResend).toHaveBeenCalledOnce();
  });
});
