import { describe, expect, it } from 'vitest';
import {
  PLAYER_PHOTO_LIMIT,
  playerPhotosOutputSchema,
  playerProfilePhotoInputSchema,
} from './photos.schema.js';

const PHOTO = {
  id: '0190a5f4-0000-7000-8000-000000000001',
  status: 'clean',
  isProfile: true,
  width: 1200,
  height: 900,
};

describe('photos du joueur (lot 1.19cd)', () => {
  it('liste : limite de six, jamais de clé ni d’URL', () => {
    const out = { limit: PLAYER_PHOTO_LIMIT, manageable: true, items: [PHOTO] };
    expect(playerPhotosOutputSchema.parse(out)).toEqual(out);
    for (const extra of [{ storageKey: 'clean/x' }, { url: 'https://s3/x' }]) {
      const items = [{ ...PHOTO, ...extra }];
      expect(playerPhotosOutputSchema.safeParse({ ...out, items }).success).toBe(false);
    }
    expect(playerPhotosOutputSchema.safeParse({ ...out, limit: 12 }).success).toBe(false);
  });

  it('photo de profil : un identifiant, ou null pour la retirer', () => {
    expect(playerProfilePhotoInputSchema.safeParse({ documentId: null }).success).toBe(true);
    expect(playerProfilePhotoInputSchema.safeParse({ documentId: PHOTO.id }).success).toBe(true);
    expect(playerProfilePhotoInputSchema.safeParse({ documentId: 'x' }).success).toBe(false);
    expect(playerProfilePhotoInputSchema.safeParse({}).success).toBe(false);
  });
});
