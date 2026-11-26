import type { Actor } from '@oz/auth';
import { describe, expect, it, vi } from 'vitest';
import { PlayerPhotoController } from './player-photo.controller.js';
import type { PlayerPhotoService } from './player-photo.service.js';

// Routes des photos (lot 1.19ce) : un identifiant mal formé devient le même 404 qu'une photo inconnue.
const PHOTO = '00000000-0000-4000-8000-000000000003';
const OZ_ID = 'OZ-CM-26-7K4M9Q-M';
const actor: Actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  roles: [{ role: 'player', organizationId: null }],
  isKyc3Verified: false,
};
const photos = {
  list: vi.fn(() => Promise.resolve('liste')),
  url: vi.fn(() => Promise.resolve('url')),
  setProfile: vi.fn(() => Promise.resolve('profil')),
  remove: vi.fn(() => Promise.resolve()),
};
const controller = new PlayerPhotoController(photos as unknown as PlayerPhotoService);

describe('PlayerPhotoController', () => {
  it('délègue au service, sa fiche (`null`) ou celle de l’OZ ID', async () => {
    expect(await controller.listOwn(actor)).toBe('liste');
    expect(photos.list).toHaveBeenLastCalledWith(actor, null);
    expect(await controller.list(actor, OZ_ID)).toBe('liste');
    expect(photos.list).toHaveBeenLastCalledWith(actor, OZ_ID);
    expect(await controller.setProfile(actor, { documentId: PHOTO })).toBe('profil');
    expect(photos.setProfile).toHaveBeenLastCalledWith(actor, PHOTO);
    expect(await controller.ownUrl(actor, PHOTO)).toBe('url');
    expect(photos.url).toHaveBeenLastCalledWith(actor, null, PHOTO);
    expect(await controller.url(actor, OZ_ID, PHOTO)).toBe('url');
    expect(photos.url).toHaveBeenLastCalledWith(actor, OZ_ID, PHOTO);
    await controller.remove(actor, PHOTO);
    expect(photos.remove).toHaveBeenLastCalledWith(actor, PHOTO);
  });

  it('identifiant de photo mal formé : chaîne vide transmise (404 sans lecture)', async () => {
    await controller.ownUrl(actor, 'pas-un-uuid');
    expect(photos.url).toHaveBeenLastCalledWith(actor, null, '');
    await controller.url(actor, OZ_ID, "1' or 1=1");
    expect(photos.url).toHaveBeenLastCalledWith(actor, OZ_ID, '');
    await controller.remove(actor, 'x');
    expect(photos.remove).toHaveBeenLastCalledWith(actor, '');
  });
});
