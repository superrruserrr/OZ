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
