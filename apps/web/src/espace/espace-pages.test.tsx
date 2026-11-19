import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';
import { OwnProfile } from './own-profile';
import { UpcomingFeature } from './upcoming-feature';

vi.mock('../i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);

describe('Mon profil (maquette v2)', () => {
  it('données réelles de la fiche, champs absents marqués « Non renseigné »', () => {
    render(
      <OwnProfile
        profile={{
          ozId: 'OZ-CM-26-ABCDEF-1',
          firstName: 'Abena',
          lastName: 'Demo',
          birthYear: 2004,
          heightCm: 178,
          dominantFoot: 'right',
          verificationLevel: 0,
        }}
        position="Attaquant"
        country="Cameroun"
        nationality="Cameroun"
      />,
      { wrapper },
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Abena Demo');
    expect(screen.getByText('178 cm')).toBeTruthy();
    expect(screen.getByText('Droit')).toBeTruthy();
    const physical = screen.getByRole('region', { name: 'Physique' });
    expect(within(physical).getByText('Non renseigné')).toBeTruthy();
    expect(screen.getByTestId('own-profile-public').getAttribute('href')).toBe(
      '/joueur/OZ-CM-26-ABCDEF-1',
    );
  });
});

describe('page à venir (Performances, Vidéos, Messages)', () => {
  it.each(['performances', 'videos', 'messages'] as const)(
    '%s : titre, badge « Bientôt disponible », aucun chiffre ni lien mort',
    (feature) => {
      render(<UpcomingFeature feature={feature} />, { wrapper });
      const page = screen.getByTestId(`upcoming-${feature}`);
      expect(within(page).getByRole('heading', { level: 1 })).toBeTruthy();
      expect(page.textContent).toContain('Bientôt disponible');
      expect(page.textContent).not.toMatch(/\d/);
      for (const link of within(page).queryAllByRole('link')) {
        expect(link.getAttribute('href')).toMatch(/^\/espace/);
      }
    },
  );

  it('performances : hexagone des aptitudes vide', () => {
    render(<UpcomingFeature feature="performances" />, { wrapper });
    expect(screen.getByRole('figure', { name: 'Aptitudes' }).dataset.state).toBe('empty');
  });
});
