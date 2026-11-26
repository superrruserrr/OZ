import { z } from 'zod';

// Photos du joueur (lot 1.19cd, U1 et U2) : déposées par `POST /documents/upload` (type `photo`),
// listées et servies par l'API des joueurs. Jamais de clé de stockage ni d'URL dans la liste : l'image
// se lit photo par photo, par une URL signée de 5 minutes, chaque lecture auditée.

/** Six photos au plus par joueur, photo de profil comprise (U2). */
export const PLAYER_PHOTO_LIMIT = 6;

export const playerPhotoSchema = z.strictObject({
  id: z.uuid(),
  /** `pending` : analyse en cours ; `rejected`/`infected` : refusée (titulaire et tuteur seulement). */
  status: z.enum(['pending', 'clean', 'rejected', 'infected']),
  isProfile: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type PlayerPhotoOutput = z.infer<typeof playerPhotoSchema>;

export const playerPhotosOutputSchema = z.strictObject({
  limit: z.literal(PLAYER_PHOTO_LIMIT),
  /** Le lecteur peut déposer, retirer et choisir la photo de profil (titulaire majeur, tuteur). */
  manageable: z.boolean(),
  items: z.array(playerPhotoSchema).max(12),
});
export type PlayerPhotosOutput = z.infer<typeof playerPhotosOutputSchema>;

/** `null` retire la photo de profil (initiales affichées). */
export const playerProfilePhotoInputSchema = z.strictObject({
  documentId: z.uuid().nullable(),
});
export type PlayerProfilePhotoInput = z.infer<typeof playerProfilePhotoInputSchema>;

export const playerPhotoParamsSchema = z.strictObject({ photoId: z.uuid() });
