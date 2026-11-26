import { AppException } from '../common/errors/api-error.js';

/** Joueur inconnu, caché ou hors de vos droits : même réponse, l'existence n'est jamais révélée. */
export const PLAYER_NOT_FOUND = (): AppException =>
  new AppException(404, 'NOT_FOUND', 'Ressource introuvable.');

/** Le compte n'a pas de fiche joueur (tuteur, inscription en cours) : rien n'est révélé d'autrui. */
export const OWN_PROFILE_NOT_FOUND = (): AppException =>
  new AppException(404, 'PLAYER_PROFILE_NOT_FOUND', 'Aucune fiche joueur pour ce compte.');

/** Fiche d'un mineur : son tuteur vérifié la modifie (`profile.update`, cellule `child`). */
export const PROFILE_UPDATE_FORBIDDEN = (): AppException =>
  new AppException(403, 'PROFILE_UPDATE_FORBIDDEN', 'Modification de la fiche non permise.');

/** Prénom, nom ou nationalité après l'examen de l'identité (décision U3 du 2026-11-19). */
export const PROFILE_IDENTITY_LOCKED = (fields: readonly string[]): AppException =>
  new AppException(
    409,
    'PROFILE_IDENTITY_LOCKED',
    'Identité examinée ou vérifiée : changement par le support.',
    fields.map((field) => ({ field, code: 'identity_locked' })),
  );
