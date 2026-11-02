import { Inject, Injectable } from '@nestjs/common';
import { generateOtpCode, phoneAllowed, type RateLimitRule } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type { PhoneStartInput, PhoneStartOutput } from '@oz/contracts';
import { accountEmail, setVerifiedPhone, withUserContext, type PrismaClient } from '@oz/db';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { AUTH_CONFIG, PHONE_CHALLENGE_TTL_SECONDS, PHONE_RESEND_SECONDS } from './auth.tokens.js';
import { UNAUTHENTICATED } from './errors.js';
import { AUTH_MAILER, type AuthMailer } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import { PhoneChallengeService } from './phone-challenge.service.js';
import { SmsDispatcher } from './sms-dispatcher.js';

/** Même refus pour un code faux, expiré ou épuisé. */
const CODE_INVALID = (): AppException =>
  new AppException(422, 'PHONE_CODE_INVALID', 'Code incorrect ou expiré.');

/**
 * Vérification du téléphone (lot 1.3cc, EX-111 n° 2) : le numéro n'entre en base qu'une fois prouvé
 * (D5). Ni lui, ni le code ne sont journalisés.
 */
@Injectable()
export class PhoneService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly limiter: RateLimiter,
    private readonly challenges: PhoneChallengeService,
    private readonly sms: SmsDispatcher,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
  ) {}

  async start(userId: string, input: PhoneStartInput): Promise<PhoneStartOutput> {
    // Avant tout envoi et les quotas du service : seul `otp_start_ip` est déjà compté (D3).
    if (!phoneAllowed(input.phone, this.config.sms.allowedPrefixes)) {
      throw new AppException(
        422,
        'PHONE_COUNTRY_UNSUPPORTED',
        'Cet indicatif de pays n’est pas encore pris en charge.',
      );
    }
    // Un renvoi trop tôt n'entame ni le quota du compte ni celui du numéro.
    const wait = await this.challenges.cooldownSeconds(userId);
    if (wait > 0) throw new RateLimitedException(wait);
    await this.limit('otp_start_account', userId);
    await this.limit('otp_start_phone', input.phone);
    if (!(await this.challenges.startCooldown(userId))) {
      throw new RateLimitedException(PHONE_RESEND_SECONDS);
    }
    const code = generateOtpCode();
    await this.challenges.issue(userId, input.phone, code);
    this.sms.sendLater(input.phone, code, input.channel);
    return { expiresIn: PHONE_CHALLENGE_TTL_SECONDS, resendAfter: PHONE_RESEND_SECONDS };
  }

  async verify(userId: string, code: string): Promise<void> {
    await this.limit('otp_verify_account', userId);
    const phone = await this.challenges.verify(userId, code);
    if (phone === null) throw CODE_INVALID();
    const outcome = await setVerifiedPhone(this.db, {
      userId,
      phone,
      encryptionKey: this.config.columnEncryptionKey,
      blindIndexKey: this.config.blindIndexKey,
    });
    if (outcome === null) throw UNAUTHENTICATED();
    if (outcome === 'changed') {
      const when = new Date();
      // Hors du temps de réponse : un échec ici est journalisé, sans annuler le numéro déjà écrit.
      this.mail.sendLater('phone_changed', async () => {
        const to = await withUserContext(this.db, userId, (tx) => accountEmail(tx));
        if (to !== null) await this.mailer.sendPhoneChanged(to, when);
      });
    }
  }

  private async limit(rule: RateLimitRule, subject: string): Promise<void> {
    const decision = await this.limiter.consume(rule, subject);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
