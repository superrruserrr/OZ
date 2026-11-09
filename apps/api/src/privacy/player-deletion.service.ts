import { Inject, Injectable } from '@nestjs/common';
import { abilityFor, playerSubject, type Actor } from '@oz/auth';
import type {
  AccountDeletionOutput,
  AccountDeletionRequestInput,
  AccountDeletionStatusOutput,
} from '@oz/contracts';
import {
  cancelPlayerDeletion,
  pendingPlayerDeletion,
  playerProfileByOzId,
  requestPlayerDeletion,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AUTH_MAILER, type AuthMailer } from '../auth/mail/auth-mailer.js';
import { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { PLAYER_NOT_FOUND } from '../player/errors.js';
import { Reauthentication } from './reauthentication.js';

const REJECTED = (): AppException =>
  new AppException(403, 'ACCOUNT_DELETION_REJECTED', 'Mot de passe ou code incorrect.');

/**
 * Suppression de la fiche d'un enfant mineur par son tuteur (lot 1.16cbb, EX-118 n° 3, D1 à D3) :
 * CASL (`profile.delete`, tuteur `child`) puis la base, qui redécide (tuteur vérifié, enfant
 * mineur), programme l'anonymisation à 30 jours et audite. Le tuteur seul annule ; l'enfant titulaire
 * d'un compte est prévenu. Sans droit : le même 404 qu'une fiche inconnue. Le journal applicatif ne
 * porte ni OZ ID, ni donnée, ni mot de passe.
 */
@Injectable()
export class PlayerDeletionService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    private readonly reauthentication: Reauthentication,
    private readonly limiter: RateLimiter,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
    @InjectPinoLogger(PlayerDeletionService.name) private readonly logger: PinoLogger,
  ) {}

  async request(
    actor: Actor,
    ozId: string,
    input: AccountDeletionRequestInput,
  ): Promise<AccountDeletionOutput> {
    await this.consume(actor.userId);
    await this.authorize(actor, ozId);
    await this.reauthentication.verify(actor.userId, input, REJECTED);
    const guardian = await this.reauthentication.emailOf(actor.userId);
    const outcome = await withUserContext(this.db, actor.userId, (tx) =>
      requestPlayerDeletion(tx, ozId),
    );
    switch (outcome.outcome) {
      case 'refused':
        throw this.refused();
      case 'pending':
        throw new AppException(
          409,
          'ACCOUNT_DELETION_PENDING',
          'La suppression de cette fiche est déjà programmée.',
        );
      case 'accepted':
        break;
    }
    this.logger.info({ event: 'player.deletion.requested' }, 'Suppression de la fiche programmée');
    const { scheduledFor, childEmail } = outcome;
    this.mail.sendLater('child_deletion_scheduled', async () => {
      if (guardian !== null) {
        await this.mailer.sendChildDeletionScheduled(guardian, scheduledFor, 'guardian');
      }
      if (childEmail !== null) {
        await this.mailer.sendChildDeletionScheduled(childEmail, scheduledFor, 'child');
      }
    });
    return {
      requestedAt: outcome.requestedAt.toISOString(),
      scheduledFor: scheduledFor.toISOString(),
    };
  }

  async status(actor: Actor, ozId: string): Promise<AccountDeletionStatusOutput> {
    await this.authorize(actor, ozId);
    const pending = await withUserContext(this.db, actor.userId, (tx) =>
      pendingPlayerDeletion(tx, ozId),
    );
    if (pending === null) return { pending: null };
    return {
      pending: {
        requestedAt: pending.requestedAt.toISOString(),
        scheduledFor: pending.scheduledFor.toISOString(),
      },
    };
  }

  /** Le tuteur seul annule (D2), jusqu'à l'exécution ; 404 sans demande. */
  async cancel(actor: Actor, ozId: string): Promise<void> {
    await this.consume(actor.userId);
    await this.authorize(actor, ozId);
    const outcome = await withUserContext(this.db, actor.userId, (tx) =>
      cancelPlayerDeletion(tx, ozId),
    );
    if (!outcome.cancelled) {
      throw new AppException(
        404,
        'ACCOUNT_DELETION_NOT_FOUND',
        'Aucune suppression de cette fiche programmée.',
      );
    }
    const when = new Date();
    this.logger.info({ event: 'player.deletion.cancelled' }, 'Suppression de la fiche annulée');
    const { childEmail } = outcome;
    this.mail.sendLater('child_deletion_cancelled', async () => {
      const guardian = await this.reauthentication.emailOf(actor.userId);
      if (guardian !== null)
        await this.mailer.sendChildDeletionCancelled(guardian, when, 'guardian');
      if (childEmail !== null)
        await this.mailer.sendChildDeletionCancelled(childEmail, when, 'child');
    });
  }

  /** CASL sur la fiche lue sous la RLS du tuteur ; sinon le 404 d'une fiche inconnue. */
  private async authorize(actor: Actor, ozId: string): Promise<void> {
    const allowed = await withUserContext(this.db, actor.userId, async (tx) => {
      const found = await playerProfileByOzId(tx, ozId);
      if (found === null) return false;
      const { checkedAt, ...access } = found.access;
      return abilityFor(actor).can('profile.delete', playerSubject(access, checkedAt));
    });
    if (!allowed) throw this.refused();
  }

  private refused(): AppException {
    this.logger.info({ event: 'player.deletion.refused' }, 'Suppression de la fiche refusée');
    return PLAYER_NOT_FOUND();
  }

  private async consume(userId: string): Promise<void> {
    const decision = await this.limiter.consume('account_deletion_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
