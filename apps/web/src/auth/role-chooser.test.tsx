import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import { RoleChooser } from './role-chooser';

vi.mock('../i18n/navigation', () => ({
  Link: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props} />
  ),
}));

describe('choix du compte, écran 02 (lot 1.5cbb, D3, ADR-013)', () => {
  it.each([
    ['fr', fr],
    ['en', en],
  ] as const)('%s : joueur et tuteur seulement, organisations annoncées', (locale, messages) => {
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <RoleChooser />
      </NextIntlClientProvider>,
    );
    const player = within(screen.getByTestId('role-card-player')).getByRole('link');
    const guardian = within(screen.getByTestId('role-card-guardian')).getByRole('link');
    expect(player.getAttribute('href')).toBe('/auth/signup/player');
    expect(guardian.getAttribute('href')).toBe('/auth/signup/guardian');
    // Une carte par compte ouvert ; les organisations arrivent au lot 1.8, après l'ouverture.
    expect(container.querySelectorAll('[data-testid^="role-card-"]')).toHaveLength(2);
    expect(screen.getByTestId('role-organizations')).toBeTruthy();
    expect(screen.getByTestId('role-login').getAttribute('href')).toBe('/auth/login');
    // Pas de promesse de vérification avant le lot 1.10 (ADR-013).
    expect(container.textContent).not.toMatch(/vérifi|verifi|KYC/i);
  });
});
