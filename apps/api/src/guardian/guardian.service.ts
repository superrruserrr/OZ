import { Inject, Injectable } from '@nestjs/common';
import { generateOneTimeToken, hashOneTimeToken } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type {
  GuardianChildrenOutput,
  GuardianInvitationAcceptOutput,
  GuardianInvitationOutput,
  GuardianInvitationPreviewOutput,
} from '@oz/contracts';
import {
  acceptGuardianInvitation,
  guardianChildren,
  inviteGuardian,
  readGuardianInvitation,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AUTH_MAILER, type AuthMailer } from '../auth/mail/auth-mailer.js';
import { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import { guardianInvitationLink } from '../auth/mail/templates.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import {
  GUARDIAN_REFUSED,
  GUARDIAN_SELF,
  INVITATION_INVALID,
  INVITATION_NOT_APPLICABLE,
} from './errors.js';

/** Invitation valable 7 jours, à usage unique (D5 du lot 1.7ba). */
export const GUARDIAN_INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Tuteur légal (lot 1.7ba, EX-108 n° 1 et 6) : le joueur mineur invite son tuteur déclaré, le compte
 * du tuteur accepte. Accepter n'est qu'un rattachement en attente (D3) : ni rôle, ni droit sur la
 * fiche, qui reste non publiée, avant la vérification du lien. Le journal applicatif ne porte ni
 * contact, ni jeton, ni prénom, ni identifiant d'enfant.
 */
@Injectable()
export class GuardianService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(GuardianService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Invitation émise par le joueur mineur connecté. Avec une adresse, OZ envoie le lien au tuteur ;
   * sans adresse (téléphone seul), le lien est rendu au joueur, qui le transmet lui-même (D1).
   */
  async invite(userId: string): Promise<GuardianInvitationOutput> {
    const decision = await this.limiter.consume('guardian_invite_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const { appUrl, columnEncryptionKey } = this.auth();
    const token = generateOneTimeToken();
    const outcome = await withUserContext(this.db, userId, (tx) =>
      inviteGuardian(tx, {
        tokenHash: hashOneTimeToken(token),
        ttlSeconds: GUARDIAN_INVITATION_TTL_SECONDS,
        encryptionKey: columnEncryptionKey,
      }),
    );
    if (outcome.outcome === 'refused') throw GUARDIAN_REFUSED();
    if (outcome.outcome !== 'created') {
      this.logger.info(
        { event: 'guardian.invitation.not_applicable', reason: outcome.outcome },
        'Invitation de tuteur impossible',
      );
      throw INVITATION_NOT_APPLICABLE();
    }
    const { email, childFirstName } = outcome;
    if (email === null) {
      this.logger.info({ event: 'guardian.invitation.created', channel: 'link' }, 'Tuteur invité');
      return { channel: 'link', link: guardianInvitationLink(appUrl, token) };
    }
    this.mail.sendLater('guardian_invitation', () =>
      this.mailer.sendGuardianInvitation(email, token, childFirstName),
    );
    this.logger.info({ event: 'guardian.invitation.created', channel: 'email' }, 'Tuteur invité');
    return { channel: 'email' };
  }

  /** Aperçu sans session : le prénom de l'enfant et le lien déclaré, rien d'autre. */
  async preview(token: string): Promise<GuardianInvitationPreviewOutput> {
    const found = await readGuardianInvitation(this.db, hashOneTimeToken(token));
    if (found === null) throw INVITATION_INVALID();
    const relationship = found.relationship;
    if (
      relationship !== 'mother' &&
      relationship !== 'father' &&
      relationship !== 'legal_guardian' &&
      relationship !== 'other'
    ) {
      throw INVITATION_INVALID();
    }
    return { childFirstName: found.childFirstName, relationship };
  }

  /** Le compte connecté devient le tuteur en attente de l'enfant (aucun droit avant vérification). */
  async accept(userId: string, token: string): Promise<GuardianInvitationAcceptOutput> {
    const outcome = await withUserContext(this.db, userId, (tx) =>
      acceptGuardianInvitation(tx, hashOneTimeToken(token)),
    );
    switch (outcome.outcome) {
      case 'invalid':
        throw INVITATION_INVALID();
      case 'self':
        throw GUARDIAN_SELF();
      case 'refused':
        throw GUARDIAN_REFUSED();
      case 'accepted':
        this.logger.info(
          { event: 'guardian.invitation.accepted' },
          'Invitation de tuteur acceptée',
        );
        return { status: 'accepted' };
    }
  }

  /** Enfants mineurs du compte connecté, rattachements en attente compris (EX-108 n° 6). */
  async children(userId: string): Promise<GuardianChildrenOutput> {
    const rows = await withUserContext(this.db, userId, (tx) => guardianChildren(tx));
    return {
      children: rows.map((row) => ({
        guardianVerified: row.guardianVerified,
        ozId: row.ozId,
        firstName: row.firstName,
        lastName: row.lastName,
        verificationStatus:
          row.verificationStatus as GuardianChildrenOutput['children'][number]['verificationStatus'],
        published: row.published,
      })),
    };
  }

  private auth(): { appUrl: string; columnEncryptionKey: string } {
    const auth = this.config.auth;
    // Le module n'est monté qu'avec FEATURE_AUTH : la configuration est toujours là.
    if (auth === undefined) throw new Error('Configuration des comptes absente.');
    return { appUrl: auth.appUrl, columnEncryptionKey: auth.columnEncryptionKey };
  }
}
