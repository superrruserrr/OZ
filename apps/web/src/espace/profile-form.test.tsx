import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';
import { draftOf, patchOf, ProfileForm } from './profile-form';

const push = vi.fn();
const update = vi.fn<(input: unknown) => Promise<unknown>>();
vi.mock('../i18n/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('./actions', () => ({ updateOwnProfile: (input: unknown) => update(input) }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);
const PROFILE = {
  firstName: 'Abena',
  lastName: 'Paul',
  nationality: 'CM',
  country: 'CM',
  region: 'Littoral',
  city: 'Douala',
  primaryPosition: 'winger' as const,
  secondaryPosition: null,
  dominantFoot: 'left' as const,
  heightCm: 172,
  weightKg: null,
  verificationStatus: 'declared' as const,
};
const COUNTRIES = [
  { value: 'CM', label: 'Cameroun' },
  { value: 'GH', label: 'Ghana' },
];

describe('patchOf (lot 1.19cb)', () => {
  it('seuls les champs changés ; vide → null ; nombre → entier ; « aucun » → null', () => {
    const initial = draftOf(PROFILE);
    expect(patchOf(initial, initial, false)).toEqual({});
    const draft = { ...initial, city: '  ', heightCm: '180', weightKg: '70', region: 'Littoral' };
    expect(patchOf(initial, draft, false)).toEqual({ city: null, heightCm: 180, weightKg: 70 });
    expect(patchOf(initial, { ...initial, secondaryPosition: 'striker' }, false)).toEqual({
      secondaryPosition: 'striker',
    });
  });

  it('identité figée : prénom, nom, nationalité jamais envoyés', () => {
    const initial = draftOf(PROFILE);
    const draft = { ...initial, firstName: 'Autre', nationality: 'GH', city: 'Kribi' };
    expect(patchOf(initial, draft, true)).toEqual({ city: 'Kribi' });
  });

  it('champ obligatoire vidé : ignoré, jamais effacé', () => {
    const initial = draftOf(PROFILE);
    expect(patchOf(initial, { ...initial, firstName: '' }, false)).toEqual({});
  });
});

describe('ProfileForm', () => {
  beforeEach(() => {
    push.mockReset();
    update.mockReset();
  });

  it('prérempli ; envoie les champs changés puis revient à Mon profil', async () => {
    update.mockResolvedValue({ ok: true, profile: PROFILE });
    const user = userEvent.setup();
    render(<ProfileForm profile={PROFILE} countries={COUNTRIES} />, { wrapper });
    const submit = screen.getByTestId('espace-profile-submit');
    expect(submit).toHaveProperty('disabled', true);
    const city = screen.getByTestId('espace-city');
    expect(city).toHaveProperty('value', 'Douala');
    await user.clear(city);
    await user.type(city, 'Kribi');
    await user.click(submit);
    expect(update).toHaveBeenCalledWith({ city: 'Kribi' });
    expect(push).toHaveBeenCalledWith({ pathname: '/espace/profil', query: { modifie: '1' } });
  });

  it('hors bornes : message sous le champ, rien d’envoyé', async () => {
    const user = userEvent.setup();
    render(<ProfileForm profile={PROFILE} countries={COUNTRIES} />, { wrapper });
    const height = screen.getByTestId('espace-heightCm');
    await user.clear(height);
    await user.type(height, '300');
    await user.click(screen.getByTestId('espace-profile-submit'));
    expect(update).not.toHaveBeenCalled();
    expect(height.getAttribute('aria-invalid')).toBe('true');
  });

  it('identité vérifiée : champs d’identité en lecture seule, avec explication', () => {
    render(
      <ProfileForm
        profile={{ ...PROFILE, verificationStatus: 'verified' }}
        countries={COUNTRIES}
      />,
      { wrapper },
    );
    expect(screen.getByTestId('espace-firstName')).toHaveProperty('readOnly', true);
    expect(screen.getByTestId('espace-profile-locked').textContent).toContain('support');
  });

  it('erreur de l’API annoncée, sans quitter la page', async () => {
    update.mockResolvedValue({ ok: false, error: 'locked' });
    const user = userEvent.setup();
    render(<ProfileForm profile={PROFILE} countries={COUNTRIES} />, { wrapper });
    await user.type(screen.getByTestId('espace-city'), 'x');
    await user.click(screen.getByTestId('espace-profile-submit'));
    expect((await screen.findByTestId('espace-profile-error')).textContent).toContain('Prénom');
    expect(push).not.toHaveBeenCalled();
  });
});
