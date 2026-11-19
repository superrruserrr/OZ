import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from '../../messages/fr.json';
import { PhotoManager } from './photo-manager';

const actions = vi.hoisted(() => ({
  listOwnPhotos: vi.fn<() => Promise<unknown>>(),
  uploadPhoto: vi.fn<(form: FormData) => Promise<unknown>>(),
  chooseProfilePhoto: vi.fn<(id: unknown) => Promise<unknown>>(),
  removePhoto: vi.fn<(id: unknown) => Promise<unknown>>(),
}));
vi.mock('./photo-actions', () => actions);

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={fr}>
    {children}
  </NextIntlClientProvider>
);
const PLAYER = '0190a5f4-0000-7000-8000-0000000000aa';
const photo = (id: string, status: 'clean' | 'pending' | 'rejected', isProfile = false) => ({
  id: `0190a5f4-0000-7000-8000-00000000000${id}`,
  status,
  isProfile,
  width: 1200,
  height: 900,
});
const gallery = (items: ReturnType<typeof photo>[], manageable = true) => ({
  limit: 6 as const,
  manageable,
  items,
});

describe('PhotoManager (lot 1.19cd)', () => {
  beforeEach(() => {
    for (const action of Object.values(actions)) action.mockReset();
  });

  it('galerie : image relayée pour une photo saine, état pour les autres, badge Profil', () => {
    render(
      <PhotoManager
        playerId={PLAYER}
        initial={gallery([
          photo('1', 'clean', true),
          photo('2', 'pending'),
          photo('3', 'rejected'),
        ])}
      />,
      { wrapper },
    );
    const image = screen.getByRole('img', { name: 'Ma photo de profil' });
    expect(image.getAttribute('src')).toBe(`/api/photos?joueur=me&id=${photo('1', 'clean').id}`);
    expect(screen.getByText('Vérification en cours…')).toBeTruthy();
    expect(screen.getByText('Photo refusée')).toBeTruthy();
    expect(screen.getByText('Profil')).toBeTruthy();
    expect(screen.getByTestId('espace-photos-count').textContent).toBe('3 sur 6');
  });

  it('dépôt : fichier relayé avec l’identifiant du joueur, galerie relue', async () => {
    actions.uploadPhoto.mockResolvedValue({ ok: true, gallery: gallery([photo('4', 'clean')]) });
    const user = userEvent.setup();
    render(<PhotoManager playerId={PLAYER} initial={gallery([])} />, { wrapper });
    expect(screen.getByTestId('espace-photos-empty')).toBeTruthy();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'match.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByTestId('espace-photo-input'), file);
    const form = actions.uploadPhoto.mock.calls[0]?.[0];
    expect(form?.get('playerId')).toBe(PLAYER);
    expect((form?.get('file') as File).name).toBe('match.jpg');
    expect(await screen.findByRole('img', { name: 'Photo de ma galerie' })).toBeTruthy();
  });

  it('six photos : ajout désactivé ; erreur de l’API annoncée', async () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((id) => photo(id, 'clean'));
    actions.removePhoto.mockResolvedValue({ ok: false, error: 'retryLater' });
    const user = userEvent.setup();
    render(<PhotoManager playerId={PLAYER} initial={gallery(six)} />, { wrapper });
    expect(screen.getByTestId('espace-photo-add')).toHaveProperty('disabled', true);
    await user.click(screen.getAllByTestId('espace-photo-remove')[0] as HTMLElement);
    expect((await screen.findByTestId('espace-photos-error')).textContent).toContain(
      'Trop de tentatives',
    );
  });

  it('choisir la photo de profil', async () => {
    const chosen = photo('2', 'clean');
    actions.chooseProfilePhoto.mockResolvedValue({
      ok: true,
      gallery: gallery([{ ...chosen, isProfile: true }]),
    });
    const user = userEvent.setup();
    render(<PhotoManager playerId={PLAYER} initial={gallery([chosen])} />, { wrapper });
    await user.click(screen.getByTestId('espace-photo-make-profile'));
    expect(actions.chooseProfilePhoto).toHaveBeenCalledWith(chosen.id);
    expect(await screen.findByText('Profil')).toBeTruthy();
  });

  it('mineur : galerie en lecture, gérée par le tuteur', () => {
    render(<PhotoManager playerId={PLAYER} initial={gallery([photo('1', 'clean')], false)} />, {
      wrapper,
    });
    expect(screen.queryByTestId('espace-photo-add')).toBeNull();
    expect(screen.queryByTestId('espace-photo-remove')).toBeNull();
    expect(screen.getByText('Ton tuteur légal gère tes photos.')).toBeTruthy();
  });
});
