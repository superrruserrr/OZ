import { Module, type DynamicModule } from '@nestjs/common';
import {
  AccessTokens,
  PWNED_DEFAULT_TIMEOUT_MS,
  PwnedPasswordsClient,
  RECAPTCHA_DEFAULT_TIMEOUT_MS,
  RecaptchaVerifier,
} from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  ACCESS_TOKENS,
  AUTH_CONFIG,
  AUTH_RESPONSE_FLOOR_MS,
  PWNED_CLIENT,
  RECAPTCHA_VERIFIER,
} from './auth.tokens.js';
import { CredentialsService } from './credentials.service.js';
import { AUTH_MAILER } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import { SmtpAuthMailer } from './mail/smtp-auth-mailer.js';
import { SessionController } from './session.controller.js';
import { SessionService } from './session.service.js';
import { SessionsController } from './sessions.controller.js';

/**
 * Durée plancher par défaut : couvre le pire cas de l'inscription, appels HaveIBeenPwned et
 * reCAPTCHA (en parallèle) jusqu'au plus long de leurs délais d'abandon, puis hachage Argon2id et
 * écriture, pour que la durée ne trahisse jamais le travail ni le verdict anti-robot.
 */
const DEFAULT_FLOOR_MS = Math.max(PWNED_DEFAULT_TIMEOUT_MS, RECAPTCHA_DEFAULT_TIMEOUT_MS) + 500;

/** Vérificateur reCAPTCHA (D4 du lot 1.3ca) ; null sans secret (local seulement). */
export function recaptchaVerifierFor(auth: AuthConfig): RecaptchaVerifier | null {
  if (auth.recaptcha === undefined) return null;
  return new RecaptchaVerifier({
    secret: auth.recaptcha.secretKey,
    minScore: auth.recaptcha.minScore,
    hostnames: [new URL(auth.appUrl).hostname],
  });
}

/** Comptes et sessions (lots 1.3a et 1.3b, EX-103) : monté seulement si FEATURE_AUTH=true (R13). */
@Module({})
export class AuthModule {
  static forRoot(auth: AuthConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(auth.hmacKey)],
      controllers: [AuthController, SessionController, SessionsController],
      providers: [
        AccessTokenGuard,
        AuthService,
        CredentialsService,
        MailDispatcher,
        SessionService,
        { provide: ACCESS_TOKENS, useFactory: () => new AccessTokens(auth.tokens.accessKey) },
        { provide: AUTH_CONFIG, useValue: auth },
        { provide: PWNED_CLIENT, useFactory: () => new PwnedPasswordsClient() },
        { provide: RECAPTCHA_VERIFIER, useFactory: () => recaptchaVerifierFor(auth) },
        { provide: AUTH_RESPONSE_FLOOR_MS, useValue: DEFAULT_FLOOR_MS },
        { provide: AUTH_MAILER, useFactory: () => new SmtpAuthMailer(auth) },
      ],
      exports: [CredentialsService],
    };
  }
}
