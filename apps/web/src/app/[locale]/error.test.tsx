import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../../messages/fr.json';
import ErrorPage from './error';
import Loading from './loading';

vi.mock('../../i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);

// États de l'application (lot 1.5bb) : erreur sans détail technique, chargement annoncé.

describe('page d’erreur', () => {
  it('message simple, sans détail technique ; réessayer et retour à l’accueil', async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('SELECT * FROM players — secret interne'), {
      digest: 'abc',
    });
    render(<ErrorPage error={error} reset={reset} />, { wrapper });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Un problème est survenu');
    expect(document.body.textContent).not.toContain('SELECT');
    expect(document.body.textContent).not.toContain('abc');
    await userEvent.click(screen.getByTestId('error-retry'));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByTestId('error-home-link').getAttribute('href')).toBe('/');
  });
});

describe('chargement', () => {
  it('squelettes annoncés une fois', () => {
    render(<Loading />, { wrapper });
    const status = screen.getByRole('status', { name: 'Chargement en cours' });
    expect(status.getAttribute('aria-busy')).toBe('true');
  });
});
