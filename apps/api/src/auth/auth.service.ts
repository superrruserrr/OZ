import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  checkFormToken,
  generateOneTimeToken,
  hashOneTimeToken,
  hashPassword,
  type PwnedPasswordsClient,
  type RecaptchaVerifier,
} from '@oz/auth';
import type { ApiConfig, AuthConfig } from '@oz/config';
import type {
  RegisterInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@oz/contracts';
import {
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { AUTH_MAILER, type AuthMailer } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import { withResponseFloor } from './response-floor.js';
import {
  AUTH_CONFIG,
  AUTH_RESPONSE_FLOOR_MS,
  PWNED_CLIENT,
  RECAPTCHA_VERIFIER,
  RESET_TTL_SECONDS,
  VERIFICATION_TTL_SECONDS,
} from './auth.tokens.js';

const INVALID_TOKEN = (): AppException =>
  new AppException(400, 'AUTH_TOKEN_INVALID', 'Lien invalide ou expiré.');

/**
 * Comptes (lot 1.3a, EX-103) : inscription, confirmation d'email, réinitialisation du mot de passe.
 * Aucune réponse ne dit si un compte existe (EX-103 n° 10, CP-28) : même corps, durée plancher, et
 * envoi des emails après la réponse.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    @Inject(PWNED_CLIENT) private readonly pwned: Pick<PwnedPasswordsClient, 'check'>,
    @Inject(AUTH_RESPONSE_FLOOR_MS) private readonly floorMs: number,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
    private readonly mail: MailDispatcher,
    private readonly limiter: RateLimiter,
    @Inject(AUTH_CONFIG) private readonly auth: AuthConfig,
    @Inject(RECAPTCHA_VERIFIER)
    private readonly recaptcha: Pick<RecaptchaVerifier, 'verify'> | null,
  ) {}

  onModuleInit(): void {
    if (this.recaptcha === null) {
      this.logger.warn(
        { event: 'auth.recaptcha.disabled', appEnv: this.config.appEnv },
        'reCAPTCHA désactivé : aucun secret configuré (local seulement)',
      );
    }
  }

  async register(input: RegisterInput): Promise<void> {
    await this.withFloor(async () => {
      // HaveIBeenPwned et anti-robot en parallèle (la durée plancher couvre le plus long des deux
      // délais). Le refus d'un mot de passe compromis (422) et la limite par adresse (429) ne
      // dépendent pas du verdict : la réponse n'apprend jamais à un robot qu'il a été détecté (D5).
      const [, bot] = await Promise.all([
        this.assertNotBreached(input.password),
        this.botReason(input),
      ]);
      const decision = await this.limiter.consume('register_email', input.email);
      if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
      if (bot !== null) {
        // Robot : même réponse, même durée, rien de créé ni d'envoyé, seul le motif journalisé.
        this.logger.info(
          { event: 'auth.bot.rejected', reason: bot },
          'Inscription de robot ignorée',
        );
        return;
      }
      const passwordHash = await hashPassword(input.password);
      const token = generateOneTimeToken();
      const created = await registerUser(this.db, {
        email: input.email,
        passwordHash,
        tokenHash: hashOneTimeToken(token),
        ttlSeconds: VERIFICATION_TTL_SECONDS,
      });
      if (created === null) {
        this.mail.sendLater('already_registered', () =>
          this.mailer.sendAlreadyRegistered(input.email),
        );
      } else {
        this.mail.sendLater('verification', () => this.mailer.sendVerification(input.email, token));
      }
    });
  }

  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    if (!(await verifyEmail(this.db, hashOneTimeToken(input.token)))) throw INVALID_TOKEN();
  }

  async requestPasswordReset(input: RequestPasswordResetInput): Promise<void> {
    await this.withFloor(async () => {
      const token = generateOneTimeToken();
      const owner = await requestPasswordReset(this.db, {
        email: input.email,
        tokenHash: hashOneTimeToken(token),
        ttlSeconds: RESET_TTL_SECONDS,
      });
      if (owner !== null) {
        this.mail.sendLater('password_reset', () =>
          this.mailer.sendPasswordReset(input.email, token),
        );
      }
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await this.assertNotBreached(input.password);
    const passwordHash = await hashPassword(input.password);
    const address = await resetPassword(this.db, {
      tokenHash: hashOneTimeToken(input.token),
      passwordHash,
    });
    if (address === null) throw INVALID_TOKEN();
    this.mail.sendLater('password_changed', () => this.mailer.sendPasswordChanged(address));
  }

  /**
   * Contrôles anti-robot de l'inscription (D4, D6), du moins coûteux au plus coûteux : champ piège,
   * jeton de formulaire (âge 3 s à 2 h), puis reCAPTCHA. Panne de reCAPTCHA : inscription acceptée
   * et journalisée, piège, chronométrie et débit restant actifs.
   */
  private async botReason(input: RegisterInput): Promise<string | null> {
    if (input.website !== undefined && input.website !== '') return 'honeypot';
    const form = checkFormToken(this.auth.hmacKey, input.formToken, Date.now());
    if (form !== 'valid') return `form_${form}`;
    if (this.recaptcha === null) return null;
    const result = await this.recaptcha.verify(input.recaptchaToken);
    if (result.verdict === 'bot') return `recaptcha_${result.reason}`;
    if (result.verdict === 'unavailable') {
      // Secret refusé par Google : notre configuration, pas une panne passagère.
      const misconfigured = result.cause === 'configuration';
      this.logger[misconfigured ? 'error' : 'warn'](
        {
          event: misconfigured ? 'auth.recaptcha.misconfigured' : 'auth.recaptcha.unavailable',
          appEnv: this.config.appEnv,
        },
        'reCAPTCHA non vérifié : inscription acceptée sans vérification',
      );
    }
    return null;
  }

  /**
   * Mot de passe présent dans HaveIBeenPwned : refusé. Service indisponible : accepté, journalisé
   * et compté (décision D1 du lot 1.3a), pour qu'une panne du tiers ne bloque pas les inscriptions.
   */
  private async assertNotBreached(password: string): Promise<void> {
    const result = await this.pwned.check(password);
    if (result === 'breached') {
      throw new AppException(
        422,
        'AUTH_PASSWORD_BREACHED',
        'Mot de passe connu dans des fuites de données.',
        [{ field: 'password', code: 'AUTH_PASSWORD_BREACHED' }],
      );
    }
    if (result === 'unavailable') {
      this.logger.warn(
        { event: 'auth.pwned.unavailable', appEnv: this.config.appEnv },
        'HaveIBeenPwned indisponible : mot de passe accepté sans vérification',
      );
    }
  }

  /** Exécute `work` et ne rend la main qu'après `floorMs`, succès ou échec. */
  private withFloor(work: () => Promise<void>): Promise<void> {
    return withResponseFloor(this.floorMs, work);
  }
}
