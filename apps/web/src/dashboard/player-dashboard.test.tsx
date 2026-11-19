import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';
import { GuardianComingSoon } from './guardian-coming-soon';
import { PlayerDashboard } from './player-dashboard';

vi.mock('../i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);

const PROFILE = {
  ozId: 'OZ-CM-26-ABCDEF-1',
  firstName: 'Awa',
  lastName: 'Test',
  birthDate: '2004-05-01',
  nationality: 'CM',
  country: 'CM',
  primaryPosition: 'striker',
  dominantFoot: 'right',
  heightCm: 178,
  verificationStatus: 'declared',
  verificationLevel: 0,
} as const;

describe('tableau de bord du joueur, maquette v2 (lots 1.5ec et 1.19b)', () => {
  const QR = 'data:image/svg+xml;base64,PHN2Zy8+';

  it('salutation, identité, OZ ID, QR et lien vers la fiche', () => {
    render(<PlayerDashboard profile={PROFILE} qr={QR} position="Attaquant" country="Cameroun" />, {
      wrapper,
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bonjour Awa');
    expect(screen.getByTestId('dashboard-name').textContent).toBe('Awa Test');
    expect(screen.getByText('Attaquant · Cameroun')).toBeTruthy();
    expect(screen.getByTestId('badge-declared').textContent).toBe('Profil déclaré');
    expect(screen.getByTestId('dashboard-view-profile').getAttribute('href')).toBe(
      '/joueur/OZ-CM-26-ABCDEF-1',
    );
    expect(within(screen.getByTestId('onboarding-own-card')).getByText(PROFILE.ozId)).toBeTruthy();
    expect(screen.getByTestId('oz-id-qr')).toBeTruthy();
    expect(screen.getByTestId('dashboard-hero-illustration').getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('complétude réelle : jauge et rubriques', () => {
    render(<PlayerDashboard profile={PROFILE} />, { wrapper });
    const meter = screen.getByRole('meter', { name: 'Profil complété' });
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(screen.getByText(/champs renseignés sur/)).toBeTruthy();
  });

  it('visibilité : état relu des blocs, lien vers les réglages', () => {
    render(<PlayerDashboard profile={{ ...PROFILE, visibility: { physical: false } }} />, {
      wrapper,
    });
    const card = screen.getByTestId('dashboard-visibility');
    expect(card.textContent).toContain('2 blocs sur 3 visibles');
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/espace/visibilite');
  });

  it('performances, activités, statistiques, vidéos : « Bientôt », aucun chiffre inventé', () => {
    render(<PlayerDashboard profile={PROFILE} />, { wrapper });
    const performances = screen.getByRole('figure', { name: 'Mes performances' });
    expect(performances.getAttribute('data-state')).toBe('empty');
    expect(performances.textContent).not.toMatch(/\d/);
    for (const id of ['dashboard-activity', 'dashboard-stats', 'dashboard-videos']) {
      const block = screen.getByTestId(id);
      expect(block.textContent).toContain('Bientôt');
      expect(block.textContent).not.toMatch(/\d/);
      expect(within(block).queryByRole('link')).toBeNull();
    }
  });
});

describe('espace du tuteur : fonctions à venir (lot 1.5ec, E2)', () => {
  it('quatre cartes désactivées, sans lien ni chiffre', () => {
    render(<GuardianComingSoon />, { wrapper });
    const soon = screen.getByRole('region', { name: 'Bientôt disponible' });
    const cards = within(soon).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.getAttribute('aria-disabled')).toBe('true');
      expect(within(card).queryByRole('link')).toBeNull();
    }
  });
});
