import { AppException } from '../common/errors/api-error.js';

/** Joueur inconnu, caché ou hors de vos droits : même réponse, l'existence n'est jamais révélée. */
export const PLAYER_NOT_FOUND = (): AppException =>
  new AppException(404, 'NOT_FOUND', 'Ressource introuvable.');

/** Le compte n'a pas de fiche joueur (tuteur, inscription en cours) : rien n'est révélé d'autrui. */
export const OWN_PROFILE_NOT_FOUND = (): AppException =>
  new AppException(404, 'PLAYER_PROFILE_NOT_FOUND', 'Aucune fiche joueur pour ce compte.');
