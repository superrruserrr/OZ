import { AppException } from '../common/errors/api-error.js';

/** Cible, intention ou droit absents : même réponse, l'existence n'est jamais révélée (D5). */
export const DOCUMENT_NOT_FOUND = (): AppException =>
  new AppException(404, 'NOT_FOUND', 'Ressource introuvable.');

/** Intention déjà réceptionnée ou rejetée : une URL de dépôt ne sert qu'une fois (D2). */
export const UPLOAD_ALREADY_USED = (): AppException =>
  new AppException(409, 'DOCUMENT_UPLOAD_USED', 'Ce dépôt a déjà été traité.');

/** Aucun fichier reçu par le stockage : l'intention reste ouverte jusqu'à son échéance. */
export const UPLOAD_MISSING = (): AppException =>
  new AppException(409, 'DOCUMENT_UPLOAD_MISSING', 'Aucun fichier reçu pour ce dépôt.');

/** Intention échue : une nouvelle demande est nécessaire. */
export const UPLOAD_EXPIRED = (): AppException =>
  new AppException(410, 'DOCUMENT_UPLOAD_EXPIRED', 'Délai de dépôt dépassé : recommencez.');

/** Taille ou type réels différents de la demande : même réponse quel que soit l'écart. */
export const UPLOAD_REJECTED = (): AppException =>
  new AppException(422, 'DOCUMENT_REJECTED', 'Fichier refusé : il ne correspond pas à la demande.');

/** Mise en file d'analyse impossible : rien n'est enregistré, le dépôt peut être réceptionné à nouveau. */
export const SCAN_UNAVAILABLE = (): AppException =>
  new AppException(503, 'SERVICE_UNAVAILABLE', 'Service momentanément indisponible.');
