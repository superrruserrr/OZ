import { AppException } from '../common/errors/api-error.js';

/** Invitation impossible : le joueur est majeur, sans tuteur déclaré, ou son tuteur a déjà un compte. */
export const INVITATION_NOT_APPLICABLE = (): AppException =>
  new AppException(
    409,
    'GUARDIAN_INVITATION_NOT_APPLICABLE',
    'Aucune invitation de tuteur n’est possible pour ce compte.',
  );

/** Inconnue, expirée, déjà utilisée ou annulée : même réponse, sans motif. */
export const INVITATION_INVALID = (): AppException =>
  new AppException(400, 'GUARDIAN_INVITATION_INVALID', 'Invitation invalide ou expirée.');

/** Un joueur ne peut pas être son propre tuteur. */
export const GUARDIAN_SELF = (): AppException =>
  new AppException(403, 'GUARDIAN_SELF', 'Un joueur ne peut pas être son propre tuteur.');

/** Compte inutilisable (email non vérifié, suspendu) ou compte d'un joueur mineur. */
export const GUARDIAN_REFUSED = (): AppException =>
  new AppException(403, 'GUARDIAN_REFUSED', 'Ce compte ne peut pas devenir tuteur.');

// Lot 1.7bb : justificatif du lien, revue, consentement.

/** Ni rattachement en attente de ce compte sur cette fiche, ni enfant lié : même réponse, sans motif. */
export const GUARDIAN_LINK_NOT_FOUND = (): AppException =>
  new AppException(404, 'GUARDIAN_LINK_NOT_FOUND', 'Rattachement introuvable.');

/** Un justificatif est déjà en revue pour cette fiche. */
export const GUARDIAN_LINK_ALREADY_SUBMITTED = (): AppException =>
  new AppException(409, 'GUARDIAN_LINK_ALREADY_SUBMITTED', 'Un justificatif est déjà en revue.');

/** Pièces absentes, d'autrui, pas encore saines, d'un autre type, ou déjà utilisées. */
export const GUARDIAN_LINK_INVALID_DOCUMENTS = (): AppException =>
  new AppException(400, 'GUARDIAN_LINK_INVALID_DOCUMENTS', 'Pièces du justificatif invalides.');

/** Lien déclaré « tuteur légal » ou « autre » : le jugement de tutelle est exigé (R3). */
export const GUARDIAN_LINK_ORDER_REQUIRED = (): AppException =>
  new AppException(
    400,
    'GUARDIAN_LINK_ORDER_REQUIRED',
    'Le jugement de tutelle est exigé pour ce lien.',
  );

/** Dépôt déjà décidé, retiré ou inconnu. */
export const GUARDIAN_REVIEW_NOT_FOUND = (): AppException =>
  new AppException(404, 'GUARDIAN_REVIEW_NOT_FOUND', 'Dépôt introuvable ou déjà décidé.');

/** Le décideur est le déposant ou l'enfant. */
export const GUARDIAN_REVIEW_CONFLICT = (): AppException =>
  new AppException(
    403,
    'GUARDIAN_REVIEW_CONFLICT',
    'Vous ne pouvez pas décider d’un dépôt qui vous concerne.',
  );

/** Retrait (C6) : le dépôt n'est pas un lien approuvé en vigueur (non approuvé, déjà retiré). */
export const GUARDIAN_REVOCATION_CONFLICT = (): AppException =>
  new AppException(
    409,
    'GUARDIAN_REVOCATION_CONFLICT',
    'Ce dépôt n’est pas un lien approuvé en vigueur.',
  );

/** Le rattachement est tombé entre le dépôt et la décision : le dépôt est retiré. */
export const GUARDIAN_REVIEW_STALE = (): AppException =>
  new AppException(409, 'GUARDIAN_REVIEW_STALE', 'Ce rattachement n’existe plus : dépôt retiré.');

/** Le texte a changé depuis sa lecture : le relire avant de consentir. */
export const CONSENT_TEXT_STALE = (): AppException =>
  new AppException(409, 'CONSENT_TEXT_STALE', 'Le texte a changé : relisez-le avant de consentir.');

/** Publication demandée sans consentement actif au traitement des données. */
export const CONSENT_REQUIRES_DATA_PROCESSING = (): AppException =>
  new AppException(
    409,
    'CONSENT_REQUIRES_DATA_PROCESSING',
    'Le consentement au traitement des données est requis d’abord.',
  );

/** Ré-authentification refusée, sans dire lequel du mot de passe ou du code est faux. */
export const GUARDIAN_REAUTH_REJECTED = (): AppException =>
  new AppException(403, 'GUARDIAN_REAUTH_REJECTED', 'Mot de passe ou code incorrect.');
