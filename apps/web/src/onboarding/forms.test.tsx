import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';

const push = vi.fn();
const replace = vi.fn();
vi.mock('../i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  useRouter: () => ({ push, replace }),
}));
const saveSignupStep = vi.fn();
const completeSignup = vi.fn();
vi.mock('./actions', () => ({ saveSignupStep, completeSignup }));

const { IdentityForm, typedAge } = await import('./identity-form');
const { GuardianForm } = await import('./guardian-form');
const { OzIdScreen } = await import('./oz-id-screen');

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);
const COUNTRIES = [{ value: 'CM', label: 'Cameroun' }];
const yearsAgo = (years: number): string => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('identité : bloc mineur à la saisie (E6, EX-121)', () => {
  it('âge indicatif seulement pour une date complète', () => {
    expect(typedAge('')).toBeNull();
    expect(typedAge('2010-1')).toBeNull();
    expect(typedAge(yearsAgo(17))).toBe(17);
  });

  it('s’ouvre pour un mineur, reste fermé pour un majeur', async () => {
    const user = userEvent.setup();
    render(<IdentityForm saved={null} countries={COUNTRIES} />, { wrapper });
    const region = screen.getByTestId('onboarding-minor-notice-region');
    expect(screen.queryByTestId('onboarding-minor-notice')).toBeNull();
    expect(region.getAttribute('aria-live')).toBe('polite');

    await user.type(screen.getByTestId('onboarding-birth-date'), yearsAgo(16));
    expect((await screen.findByTestId('onboarding-minor-notice')).textContent).toContain(
      'tuteur légal',
    );
    expect(screen.getByText('16 ans')).toBeTruthy();

    await user.clear(screen.getByTestId('onboarding-birth-date'));
    await user.type(screen.getByTestId('onboarding-birth-date'), yearsAgo(25));
    expect(screen.queryByTestId('onboarding-minor-notice')).toBeNull();
  });

  it('n’enregistre rien tant que l’identité est incomplète', async () => {
    const user = userEvent.setup();
    render(<IdentityForm saved={null} countries={COUNTRIES} />, { wrapper });
    await user.click(screen.getByTestId('onboarding-submit'));
    expect(await screen.findAllByText('Nom trop court.')).toHaveLength(2);
    expect(screen.getByText('Date de naissance invalide.')).toBeTruthy();
    expect(saveSignupStep).not.toHaveBeenCalled();
  });

  it('reprend les données enregistrées', () => {
    render(
      <IdentityForm
        saved={{
          firstName: 'Awa',
          lastName: 'Diallo',
          birthDate: '2000-04-12',
          nationality: 'CM',
          country: 'CM',
        }}
        countries={COUNTRIES}
      />,
      { wrapper },
    );
    expect(screen.getByTestId<HTMLInputElement>('onboarding-first-name').value).toBe('Awa');
    expect(screen.getByTestId('onboarding-country').textContent).toContain('Cameroun');
  });
});

describe('tuteur (EX-107 n° 4)', () => {
  it('exige un téléphone ou un email', async () => {
    const user = userEvent.setup();
    render(
      <GuardianForm
        saved={{
          firstName: 'Mariam',
          lastName: 'Diallo',
          relationship: 'mother',
          country: 'CM',
          phone: '+237690000000',
        }}
        countries={COUNTRIES}
      />,
      { wrapper },
    );
    await user.clear(screen.getByTestId('onboarding-guardian-phone'));
    await user.click(screen.getByTestId('onboarding-submit'));
    expect(await screen.findByText('Indiquez un téléphone ou un email.')).toBeTruthy();
    expect(saveSignupStep).not.toHaveBeenCalled();
  });

  it('enregistre puis passe à l’étape suivante', async () => {
    saveSignupStep.mockResolvedValueOnce({ ok: true, next: '/onboarding/oz-id' });
    const user = userEvent.setup();
    render(
      <GuardianForm
        saved={{ firstName: 'Mariam', lastName: 'Diallo', relationship: 'mother', country: 'CM' }}
        countries={COUNTRIES}
      />,
      { wrapper },
    );
    await user.type(screen.getByTestId('onboarding-guardian-email'), 'mariam@exemple.cm');
    await user.click(screen.getByTestId('onboarding-submit'));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith('/onboarding/oz-id');
    });
    expect(saveSignupStep).toHaveBeenCalledWith('guardian', {
      firstName: 'Mariam',
      lastName: 'Diallo',
      relationship: 'mother',
      country: 'CM',
      email: 'mariam@exemple.cm',
    });
  });
});

describe('carte OZ ID (EX-120)', () => {
  const props = {
    name: 'Awa Diallo',
    details: ['Attaquant', 'Cameroun'],
    summary: [{ label: 'Nom', value: 'Awa Diallo' }],
  };

  it('un seul appel sur un double clic, puis OZ ID déclaré et complétude de l’API', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    completeSignup.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    render(<OzIdScreen {...props} />, { wrapper });
    await user.dblClick(screen.getByTestId('onboarding-complete'));
    expect(completeSignup).toHaveBeenCalledTimes(1);
    resolve({
      ok: true,
      card: {
        ozId: 'OZ-CM-26-7K4M9Q-3',
        verificationStatus: 'declared',
        minor: false,
        completeness: 60,
      },
    });
    expect((await screen.findByTestId('oz-id-card-value')).textContent).toContain('OZ-CM');
    expect(screen.getByTestId('badge-declared').textContent).toBe('Déclaré');
    expect(screen.getByTestId('onboarding-completeness').textContent).toBe(
      'Profil complété à 60 %',
    );
  });

  it('coupure réseau : panne annoncée, bouton de nouveau utilisable', async () => {
    completeSignup.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<OzIdScreen {...props} />, { wrapper });
    await user.click(screen.getByTestId('onboarding-complete'));
    expect((await screen.findByTestId('onboarding-error')).textContent).toBe(
      'Service momentanément indisponible. Réessayez.',
    );
    completeSignup.mockResolvedValueOnce({ ok: false, error: 'refused', fields: {} });
    await user.click(screen.getByTestId('onboarding-complete'));
    expect(completeSignup).toHaveBeenCalledTimes(2);
  });

  it('annonce un tuteur manquant sans afficher de carte', async () => {
    completeSignup.mockResolvedValueOnce({ ok: false, error: 'guardianRequired', fields: {} });
    render(<OzIdScreen {...props} />, { wrapper });
    await userEvent.setup().click(screen.getByTestId('onboarding-complete'));
    expect((await screen.findByTestId('onboarding-error')).textContent).toBe(
      'Un parent ou tuteur légal doit être déclaré.',
    );
    expect(screen.queryByTestId('oz-id-card')).toBeNull();
  });
});
