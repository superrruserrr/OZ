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

describe('tableau de bord du joueur (lot 1.5ec, E3)', () => {
  it('accueil, OZ ID et lien vers la fiche', () => {
    render(<PlayerDashboard profile={PROFILE} />, { wrapper });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Awa');
    expect(screen.getByText('OZ-CM-26-ABCDEF-1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir ma fiche' }).getAttribute('href')).toBe(
      '/joueur/OZ-CM-26-ABCDEF-1',
    );
  });

  it('hexagone de complétude réel et jauge des champs renseignés', () => {
    render(<PlayerDashboard profile={PROFILE} />, { wrapper });
    const radar = screen.getByRole('figure', { name: 'Complétude de ta fiche par rubrique' });
    expect(radar.dataset.state).toBe('filled');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('8 champs sur 15');
  });

  it('aptitudes : hexagone vide, aucun chiffre, en attente de mesures certifiées', () => {
    render(<PlayerDashboard profile={PROFILE} />, { wrapper });
    const radar = screen.getByRole('figure', { name: 'Aptitudes' });
    expect(radar.dataset.state).toBe('empty');
    expect(radar.textContent).not.toMatch(/\d/);
  });

  it('fonctions à venir : cartes « Bientôt disponible » désactivées, sans lien ni chiffre', () => {
    render(<PlayerDashboard profile={PROFILE} />, { wrapper });
    const soon = screen.getByRole('region', { name: 'Bientôt disponible' });
    const cards = within(soon).getAllByRole('listitem');
    expect(cards.length).toBeGreaterThanOrEqual(6);
    for (const card of cards) {
      expect(card.getAttribute('aria-disabled')).toBe('true');
      expect(within(card).queryByRole('link')).toBeNull();
      expect(card.textContent).not.toMatch(/\d/);
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
