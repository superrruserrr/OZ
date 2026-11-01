import { SetMetadata } from '@nestjs/common';

export const TWO_FACTOR_EXEMPT = 'oz:two-factor-exempt';

/**
 * Route ouverte à une session restreinte (D6 du lot 1.3cb) : compte à rôle obligatoire sans 2FA.
 * Sans ce décorateur, `AccessTokenGuard` refuse : une route nouvelle est fermée par défaut.
 */
export const TwoFactorEnrollment = () => SetMetadata(TWO_FACTOR_EXEMPT, true);
