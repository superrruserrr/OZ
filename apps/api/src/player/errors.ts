import { AppException } from '../common/errors/api-error.js';

/** Joueur inconnu, caché ou hors de vos droits : même réponse, l'existence n'est jamais révélée. */
export const PLAYER_NOT_FOUND = (): AppException =>
  new AppException(404, 'NOT_FOUND', 'Ressource introuvable.');
