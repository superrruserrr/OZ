import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import fr from '../../messages/fr.json';
import AdminHomePage from './page';

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);

describe('accueil du back-office (squelette)', () => {
  it('affiche « OZ · Administration » en titre unique', () => {
    render(<AdminHomePage />, { wrapper });
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles).toHaveLength(1);
    expect(titles[0]?.textContent).toBe('OZ · Administration');
  });

  it('porte le repère orange du back-office (design.md §8.4 n° 5)', () => {
    render(<AdminHomePage />, { wrapper });
    expect(screen.getByTestId('admin-badge').className).toContain('text-oz-admin');
  });
});
