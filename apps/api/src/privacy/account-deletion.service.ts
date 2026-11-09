import { Inject, Injectable } from '@nestjs/common';
import type {
  AccountDeletionOutput,
  AccountDeletionRequestInput,
  AccountDeletionStatusOutput,
} from '@oz/contracts';
import {
  cancelAccountDeletion,
  pendingAccountDeletion,
  requestAccountDeletion,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { UNAUTHENTICATED } from '../auth/errors.js';
import { AUTH_MAILER, type AuthMailer } from '../auth/mail/auth-mailer.js';
import { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import { Reauthentication } from './reauthentication.js';

/** Refus unique : ne dit jamais lequel, du mot de passe ou du code, est faux ou manque. */
const REJECTED = (): AppException =>
  new AppException(403, 'ACCOUNT_DELETION_REJECTED', 'Mot de passe ou code incorrect.');

/**
 * Suppression du compte (lot 1.16ca, EX-118 n° 3) : demande ré-authentifiée, décidée et auditée par
 * la base, qui révoque toutes les sessions et programme l'anonymisation à 30 jours (D1, D2). Le
 * titulaire peut se reconnecter pour suivre ou annuler. Ni mot de passe ni code ne sont journalisés.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    private readonly reauthentication: Reauthentication,
    private readonly limiter: RateLimiter,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
    @InjectPinoLogger(AccountDeletionService.name) private readonly logger: PinoLogger,
  ) {}

  async request(
    userId: string,
    input: AccountDeletionRequestInput,
  ): Promise<AccountDeletionOutput> {
    await this.consume(userId);
    await this.reauthentication.verify(userId, input, REJECTED);
    // Adresse lue avant la demande : l'alerte part même si le compte change ensuite.
    const address = await this.reauthentication.emailOf(userId);
    const outcome = await withUserContext(this.db, userId, (tx) => requestAccountDeletion(tx));
    switch (outcome.outcome) {
      case 'refused':
        throw UNAUTHENTICATED();
      case 'pending':
        throw new AppException(
          409,
          'ACCOUNT_DELETION_PENDING',
          'La suppression du compte est déjà programmée.',
        );
      case 'accepted':
        break;
    }
    this.logger.info({ event: 'account.deletion.requested' }, 'Suppression du compte programmée');
    this.mail.sendLater('account_deletion_scheduled', async () => {
      if (address !== null) {
        await this.mailer.sendAccountDeletionScheduled(address, outcome.scheduledFor);
      }
    });
    return {
      requestedAt: outcome.requestedAt.toISOString(),
      scheduledFor: outcome.scheduledFor.toISOString(),
    };
  }

  /** Demande en attente du compte, ou `null`. */
  async status(userId: string): Promise<AccountDeletionStatusOutput> {
    const pending = await withUserContext(this.db, userId, (tx) => pendingAccountDeletion(tx));
    if (pending === null) return { pending: null };
    return {
      pending: {
        requestedAt: pending.requestedAt.toISOString(),
        scheduledFor: pending.scheduledFor.toISOString(),
      },
    };
  }

  /** Annule la demande en attente, avant son échéance ; 404 sans demande. */
  async cancel(userId: string): Promise<void> {
    await this.consume(userId);
    const cancelled = await withUserContext(this.db, userId, (tx) => cancelAccountDeletion(tx));
    if (!cancelled) {
      throw new AppException(
        404,
        'ACCOUNT_DELETION_NOT_FOUND',
        'Aucune suppression du compte programmée.',
      );
    }
    const when = new Date();
    this.logger.info({ event: 'account.deletion.cancelled' }, 'Suppression du compte annulée');
    this.mail.sendLater('account_deletion_cancelled', async () => {
      const address = await this.reauthentication.emailOf(userId);
      if (address !== null) await this.mailer.sendAccountDeletionCancelled(address, when);
    });
  }

  private async consume(userId: string): Promise<void> {
    const decision = await this.limiter.consume('account_deletion_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
