import { Inject, Injectable } from '@nestjs/common';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  totpUri,
  verifyTotpCode,
} from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type {
  RecoveryCodesOutput,
  TwoFactorDisableInput,
  TwoFactorEnableInput,
  TwoFactorSetupOutput,
} from '@oz/contracts';
import { qrSvg } from '@oz/core';
import {
  accountEmail,
  beginTotp,
  consumeRecoveryCode,
  consumeTotpStep,
  disableTotp,
  enableTotp,
  replaceRecoveryCodes,
  totpState,
  withUserContext,
  type PrismaClient,
  type TotpState,
} from '@oz/db';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { AUTH_CONFIG } from './auth.tokens.js';
import { CredentialsService } from './credentials.service.js';
import { AUTH_MAILER, type AuthMailer } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import { RetryLaterException, UNAUTHENTICATED } from './errors.js';

/** Libellé de l'application d'authentification : pas d'adresse sur le téléphone. */
const ACCOUNT_LABEL = 'Compte OZ';

/** Refus unique : ne dit jamais lequel, du mot de passe ou du code, est faux. */
const REJECTED = (): AppException =>
  new AppException(403, 'AUTH_2FA_REJECTED', 'Mot de passe ou code incorrect.');
const CONFLICT = (code: string, message: string): AppException =>
  new AppException(409, code, message);

/**
 * 2FA TOTP (lot 1.3cb, EX-103 n° 7) : enrôlement, activation, désactivation et vérification d'un
 * second facteur. Le secret n'est en clair que le temps d'un calcul ; ni lui, ni les codes ne sont
 * journalisés.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly credentials: CredentialsService,
    private readonly limiter: RateLimiter,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
  ) {}

  /** État du compte ; `null` s'il ne peut plus tenir de session. */
  state(userId: string): Promise<TotpState | null> {
    return totpState(this.db, userId, this.config.totpEncryptionKey);
  }

  async setup(userId: string): Promise<TwoFactorSetupOutput> {
    await this.limit(userId);
    const secret = generateTotpSecret();
    const begun = await beginTotp(this.db, {
      userId,
      secret,
      key: this.config.totpEncryptionKey,
    });
    if (!begun) throw UNAUTHENTICATED();
    const uri = totpUri({ secret, label: ACCOUNT_LABEL });
    return { secret, uri, qrSvg: qrSvg(uri) };
  }

  /** Première activation, ou changement d'appareil avec le code de l'appareil actuel (D7). */
  async enable(
    userId: string,
    familyId: string,
    input: TwoFactorEnableInput,
  ): Promise<RecoveryCodesOutput> {
    await this.limit(userId);
    const state = await this.requireState(userId);
    if (state.pendingSecret === null) {
      throw CONFLICT('AUTH_2FA_NOT_PENDING', 'Aucun enrôlement en cours.');
    }
    const step = verifyTotpCode({
      secret: state.pendingSecret,
      code: input.code,
      nowMs: Date.now(),
    });
    if (step === null) throw REJECTED();
    if (state.secret !== null) {
      if (input.currentCode === undefined) throw REJECTED();
      await this.requireSecondFactor(userId, state, input.currentCode);
    }
    const recoveryCodes = generateRecoveryCodes();
    const enabled = await enableTotp(this.db, {
      userId,
      secret: state.pendingSecret,
      step,
      recoveryHashes: recoveryCodes.map((code) => this.recoveryHash(code)),
      key: this.config.totpEncryptionKey,
      keepFamilyId: familyId,
    });
    // Un enrôlement concurrent a remplacé le secret qui vient d'être vérifié.
    if (!enabled) throw CONFLICT('AUTH_2FA_NOT_PENDING', 'Aucun enrôlement en cours.');
    this.alert(userId, 'two_factor_enabled', (to, when) =>
      this.mailer.sendTwoFactorEnabled(to, when),
    );
    return { recoveryCodes };
  }

  /** Désactivation : mot de passe et code (D7), refusée si un rôle impose la 2FA (D6). */
  async disable(userId: string, familyId: string, input: TwoFactorDisableInput): Promise<void> {
    await this.limit(userId);
    const state = await this.requireState(userId);
    if (state.secret === null) {
      throw CONFLICT('AUTH_2FA_NOT_ENABLED', 'Validation en deux étapes inactive.');
    }
    if (state.required) throw this.mandatory();
    const email = await this.emailOf(userId);
    if (email === null) throw UNAUTHENTICATED();
    const verdict = await this.credentials.verify(email, input.password);
    if (verdict.result === 'retry_later') throw new RetryLaterException(verdict.retryAfterSeconds);
    if (verdict.result !== 'ok') throw REJECTED();
    await this.requireSecondFactor(userId, state, input.code);
    const outcome = await disableTotp(this.db, { userId, keepFamilyId: familyId });
    // Un rôle attribué pendant la vérification l'emporte.
    if (outcome === 'required') throw this.mandatory();
    if (outcome === 'inactive') {
      throw CONFLICT('AUTH_2FA_NOT_ENABLED', 'Validation en deux étapes inactive.');
    }
    this.alert(userId, 'two_factor_disabled', (to, when) =>
      this.mailer.sendTwoFactorDisabled(to, when),
    );
  }

  /** Nouveau lot de codes de secours : l'ancien cesse de valoir (D5). */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<RecoveryCodesOutput> {
    await this.limit(userId);
    const state = await this.requireState(userId);
    if (state.secret === null) {
      throw CONFLICT('AUTH_2FA_NOT_ENABLED', 'Validation en deux étapes inactive.');
    }
    await this.requireSecondFactor(userId, state, code);
    const recoveryCodes = generateRecoveryCodes();
    const replaced = await replaceRecoveryCodes(
      this.db,
      userId,
      recoveryCodes.map((value) => this.recoveryHash(value)),
    );
    if (!replaced) throw CONFLICT('AUTH_2FA_NOT_ENABLED', 'Validation en deux étapes inactive.');
    this.alert(userId, 'recovery_codes_replaced', (to, when) =>
      this.mailer.sendRecoveryCodesReplaced(to, when),
    );
    return { recoveryCodes };
  }

  /**
   * Vérifie un code TOTP ou de secours, sous le délai exponentiel (D8). Le pas ou le code de secours
   * est consommé en base : deux requêtes simultanées n'en valident qu'une (D2, D5).
   */
  async checkSecondFactor(userId: string, state: TotpState, code: string): Promise<boolean> {
    const wait = await this.credentials.reserveSecondFactor(userId);
    if (wait > 0) throw new RetryLaterException(wait);
    const accepted = await this.consume(userId, state, code);
    if (accepted) await this.credentials.clearSecondFactor(userId);
    return accepted;
  }

  private async requireSecondFactor(userId: string, state: TotpState, code: string): Promise<void> {
    if (!(await this.checkSecondFactor(userId, state, code))) throw REJECTED();
  }

  private async consume(userId: string, state: TotpState, code: string): Promise<boolean> {
    if (state.secret === null) return false;
    const step = verifyTotpCode({
      secret: state.secret,
      code,
      nowMs: Date.now(),
      lastStep: state.lastStep,
    });
    if (step !== null) return consumeTotpStep(this.db, userId, step);
    if (normalizeRecoveryCode(code) === null) return false;
    const remaining = await consumeRecoveryCode(this.db, userId, this.recoveryHash(code));
    if (remaining === null) return false;
    this.alert(userId, 'recovery_code_used', (to, when) =>
      this.mailer.sendRecoveryCodeUsed(to, when),
    );
    return true;
  }

  private async requireState(userId: string): Promise<TotpState> {
    const state = await this.state(userId);
    if (state === null) throw UNAUTHENTICATED();
    return state;
  }

  /** Quota par compte (D8) ; l'IP est comptée par `@RateLimit` sur la route. */
  private async limit(userId: string): Promise<void> {
    const decision = await this.limiter.consume('totp_enroll_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }

  private mandatory(): AppException {
    return new AppException(
      403,
      'AUTH_2FA_REQUIRED',
      'La validation en deux étapes est obligatoire pour ce compte.',
    );
  }

  private recoveryHash(code: string): string {
    return hashRecoveryCode(this.config.hmacKey, code);
  }

  private emailOf(userId: string): Promise<string | null> {
    return withUserContext(this.db, userId, (tx) => accountEmail(tx));
  }

  /** Alerte après la réponse : ni secret ni code, adresse relue hors du temps de réponse. */
  private alert(
    userId: string,
    kind: string,
    send: (to: string, when: Date) => Promise<void>,
  ): void {
    const when = new Date();
    this.mail.sendLater(kind, async () => {
      const address = await this.emailOf(userId);
      if (address !== null) await send(address, when);
    });
  }
}
