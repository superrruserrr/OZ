import { Inject, Injectable } from '@nestjs/common';
import {
  generateOneTimeToken,
  hashOneTimeToken,
  hashPassword,
  type PwnedPasswordsClient,
} from '@oz/auth';
import type { ApiConfig } from '@oz/config';
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
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { AUTH_MAILER, type AuthMailer } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import { withResponseFloor } from './response-floor.js';
import {
  AUTH_RESPONSE_FLOOR_MS,
  PWNED_CLIENT,
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
export class AuthService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    @Inject(PWNED_CLIENT) private readonly pwned: Pick<PwnedPasswordsClient, 'check'>,
    @Inject(AUTH_RESPONSE_FLOOR_MS) private readonly floorMs: number,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
    private readonly mail: MailDispatcher,
  ) {}

  async register(input: RegisterInput): Promise<void> {
    await this.withFloor(async () => {
      await this.assertNotBreached(input.password);
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
