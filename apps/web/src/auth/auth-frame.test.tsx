import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import AppLayout from '../app/[locale]/(app)/layout';
import AuthLayout from '../app/[locale]/(auth)/layout';

vi.mock('../i18n/navigation', () => ({
  Link: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props} />
  ),
  usePathname: () => '/auth/login',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

function renderIn(locale: 'fr' | 'en', ui: ReactNode): ReturnType<typeof render> {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'fr' ? fr : en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('coquille des écrans de compte (lot 1.5cbb, D1)', () => {
  it.each(['fr', 'en'] as const)(
    '%s : lien d’évitement, barre compacte, panneau et accroche',
    (locale) => {
      renderIn(
        locale,
        <AuthLayout>
          <p>formulaire</p>
        </AuthLayout>,
      );
      expect(screen.getByTestId('auth-skip-link').getAttribute('href')).toBe('#contenu');
      expect(screen.getByTestId('auth-home-link').getAttribute('href')).toBe('/');
      const panel = screen.getByTestId('auth-panel');
      expect(within(panel).getByText('formulaire')).toBeTruthy();
      const aside = screen.getByTestId('auth-aside');
      expect(within(aside).getAllByRole('listitem')).toHaveLength(3);
      // Règles 1.5c et ADR-013 : ni chiffre, ni promesse de vérification dans l'accroche.
      expect(aside.textContent).not.toMatch(/\d/);
      expect(aside.textContent).not.toMatch(/vérifi|verifi|KYC/i);
    },
  );

  it('écrans connectés : même coquille, sans accroche (D4)', () => {
    renderIn(
      'fr',
      <AppLayout>
        <p>étape</p>
      </AppLayout>,
    );
    expect(within(screen.getByTestId('auth-panel')).getByText('étape')).toBeTruthy();
    expect(screen.queryByTestId('auth-aside')).toBeNull();
  });
});
