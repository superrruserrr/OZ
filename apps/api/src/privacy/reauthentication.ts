import { Inject, Injectable } from '@nestjs/common';
import { accountEmail, withUserContext, type PrismaClient } from '@oz/db';
import type { AppException } from '../common/errors/api-error.js';
import { DB_CLIENT } from '../database/database.module.js';
import { CredentialsService } from '../auth/credentials.service.js';
import { RetryLaterException, UNAUTHENTICATED } from '../auth/errors.js';
import { TwoFactorService } from '../auth/two-factor.service.js';

/** Preuve demandée avant un acte sur ses données : mot de passe, plus un code si la 2FA est active. */
export interface ReauthenticationInput {
  readonly password: string;
  readonly code?: string | undefined;
}

/**
 * Ré-authentification des actes sur ses données (export, lot 1.16ba ; suppression, lot 1.16ca).
 * Mot de passe sous le délai exponentiel partagé avec la connexion, puis second facteur si la 2FA
 * est active, comme `POST /auth/2fa/disable` : un code n'est consommé qu'après un mot de passe juste
 * (une faute de frappe ne coûte pas un code de secours). Oracle résiduel : D-114. Un seul refus,
 * `rejected`, qui ne dit jamais lequel du mot de passe ou du code est faux ou manque.
 */
@Injectable()
export class Reauthentication {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    private readonly credentials: CredentialsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async verify(
    userId: string,
    input: ReauthenticationInput,
    rejected: () => AppException,
  ): Promise<void> {
    const email = await this.emailOf(userId);
    if (email === null) throw UNAUTHENTICATED();
    const verdict = await this.credentials.verify(email, input.password);
    if (verdict.result === 'retry_later') throw new RetryLaterException(verdict.retryAfterSeconds);
    if (verdict.result !== 'ok') throw rejected();
    const state = await this.twoFactor.state(userId);
    if (state === null) throw UNAUTHENTICATED();
    if (state.secret === null) return;
    if (input.code === undefined) throw rejected();
    if (!(await this.twoFactor.checkSecondFactor(userId, state, input.code))) throw rejected();
  }

  /** Adresse du compte vivant, ou `null`. */
  emailOf(userId: string): Promise<string | null> {
    return withUserContext(this.db, userId, (tx) => accountEmail(tx));
  }
}
