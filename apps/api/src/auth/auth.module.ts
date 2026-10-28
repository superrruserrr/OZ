import { Module, type DynamicModule } from '@nestjs/common';
import { PWNED_DEFAULT_TIMEOUT_MS, PwnedPasswordsClient } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AUTH_CONFIG, AUTH_RESPONSE_FLOOR_MS, PWNED_CLIENT } from './auth.tokens.js';
import { CredentialsService } from './credentials.service.js';
import { AUTH_MAILER } from './mail/auth-mailer.js';
import { SmtpAuthMailer } from './mail/smtp-auth-mailer.js';

/**
 * Durée plancher par défaut : couvre le pire cas de l'inscription, appel HaveIBeenPwned jusqu'à son
 * délai d'abandon puis hachage Argon2id et écriture, pour que la durée ne trahisse jamais le travail.
 */
const DEFAULT_FLOOR_MS = PWNED_DEFAULT_TIMEOUT_MS + 500;

/** Comptes (lot 1.3a, EX-103) : monté seulement si FEATURE_AUTH=true (R13). */
@Module({})
export class AuthModule {
  static forRoot(auth: AuthConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [DatabaseModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        CredentialsService,
        { provide: AUTH_CONFIG, useValue: auth },
        { provide: PWNED_CLIENT, useFactory: () => new PwnedPasswordsClient() },
        { provide: AUTH_RESPONSE_FLOOR_MS, useValue: DEFAULT_FLOOR_MS },
        { provide: AUTH_MAILER, useFactory: () => new SmtpAuthMailer(auth) },
      ],
      exports: [CredentialsService],
    };
  }
}
