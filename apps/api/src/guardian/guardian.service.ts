import { Inject, Injectable } from '@nestjs/common';
import { generateOneTimeToken, hashOneTimeToken } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type { Actor } from '@oz/auth';
import type {
  ConsentTextOutput,
  GuardianChildrenOutput,
  GuardianConsentGrantInput,
  GuardianConsentOutput,
  GuardianConsentRevokeOutput,
  GuardianInvitationAcceptOutput,
  GuardianInvitationOutput,
  GuardianInvitationPreviewOutput,
  GuardianLinkDecisionInput,
  GuardianLinkDecisionOutput,
  GuardianLinkQueueOutput,
  GuardianLinkSubmitInput,
  GuardianLinkSubmitOutput,
} from '@oz/contracts';
import {
  acceptGuardianInvitation,
  currentConsentText,
  decideGuardianLink,
  grantGuardianConsent,
  guardianChildren,
  guardianLinkQueue,
  inviteGuardian,
  readGuardianInvitation,
  revokeGuardianConsent,
  submitGuardianLink,
  withUserContext,
  type GuardianConsentType,
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
import { Reauthentication } from '../privacy/reauthentication.js';
import {
  CONSENT_REQUIRES_DATA_PROCESSING,
  CONSENT_TEXT_STALE,
  GUARDIAN_LINK_ALREADY_SUBMITTED,
  GUARDIAN_LINK_INVALID_DOCUMENTS,
  GUARDIAN_LINK_NOT_FOUND,
  GUARDIAN_LINK_ORDER_REQUIRED,
  GUARDIAN_REAUTH_REJECTED,
  GUARDIAN_REFUSED,
  GUARDIAN_REVIEW_CONFLICT,
  GUARDIAN_REVIEW_NOT_FOUND,
  GUARDIAN_REVIEW_STALE,
  GUARDIAN_SELF,
  INVITATION_INVALID,
  INVITATION_NOT_APPLICABLE,
} from './errors.js';

/** Invitation valable 7 jours, à usage unique (D5 du lot 1.7ba). */
export const GUARDIAN_INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Pièces du justificatif gardées 6 mois après la décision, puis purgées (R3 du lot 1.7bb). */
export const GUARDIAN_LINK_RETENTION_DAYS = 183;

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
    private readonly reauthentication: Reauthentication,
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
    type Child = GuardianChildrenOutput['children'][number];
    return {
      children: rows.map((row) => ({
        guardianId: row.guardianId,
        guardianVerified: row.guardianVerified,
        linkStatus: row.linkStatus,
        ozId: row.ozId,
        firstName: row.firstName,
        lastName: row.lastName,
        verificationStatus: row.verificationStatus as Child['verificationStatus'],
        published: row.published,
        consents: row.consents as Child['consents'],
      })),
    };
  }

  /**
   * Dépôt du justificatif par le compte du rattachement en attente (lot 1.7bb, EX-108 n° 2) : les
   * pièces, déjà déposées et saines, sont jugées par la base.
   */
  async submitLink(
    userId: string,
    input: GuardianLinkSubmitInput,
  ): Promise<GuardianLinkSubmitOutput> {
    const decision = await this.limiter.consume('guardian_link_submit_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const outcome = await withUserContext(this.db, userId, (tx) =>
      submitGuardianLink(tx, input.guardianId, input.documentIds),
    );
    switch (outcome.outcome) {
      case 'submitted':
        this.logger.info({ event: 'guardian.link.submitted' }, 'Justificatif de lien déposé');
        return { status: 'submitted' };
      case 'refused':
        throw GUARDIAN_REFUSED();
      case 'not_found':
        throw GUARDIAN_LINK_NOT_FOUND();
      case 'already_submitted':
        throw GUARDIAN_LINK_ALREADY_SUBMITTED();
      case 'invalid_documents':
        throw GUARDIAN_LINK_INVALID_DOCUMENTS();
      case 'order_required':
        throw GUARDIAN_LINK_ORDER_REQUIRED();
    }
  }

  /** File de revue (administrateur vérifié ; la base le revérifie). */
  async linkQueue(actor: Actor, limit: number): Promise<GuardianLinkQueueOutput> {
    const rows = await withUserContext(this.db, actor.userId, (tx) => guardianLinkQueue(tx, limit));
    return {
      reviews: rows.map((row) => ({
        reviewId: row.reviewId,
        submittedAt: row.submittedAt.toISOString(),
        relationship:
          row.relationship as GuardianLinkQueueOutput['reviews'][number]['relationship'],
        guardianFirstName: row.guardianFirstName,
        guardianLastName: row.guardianLastName,
        childFirstName: row.childFirstName,
        childLastName: row.childLastName,
        childBirthDate: row.childBirthDate.toISOString().slice(0, 10),
        rejections: row.rejections,
        documentIds: [...row.documentIds],
      })),
    };
  }

  /**
   * Décision ré-authentifiée d'un administrateur (R1, R2, R4). Approuver pose le compte et le rôle
   * tuteur, fiche `in_review` ; refuser donne un motif de la liste fermée. Avis au déposant.
   */
  async decideLink(
    actor: Actor,
    reviewId: string,
    input: GuardianLinkDecisionInput,
  ): Promise<GuardianLinkDecisionOutput> {
    await this.reauthentication.verify(actor.userId, input, GUARDIAN_REAUTH_REJECTED);
    const decision =
      input.decision === 'approve'
        ? ({ approve: true } as const)
        : ({ approve: false, reason: input.reason } as const);
    const outcome = await withUserContext(this.db, actor.userId, (tx) =>
      decideGuardianLink(tx, reviewId, decision, GUARDIAN_LINK_RETENTION_DAYS),
    );
    switch (outcome.outcome) {
      case 'refused':
        throw GUARDIAN_REFUSED();
      case 'not_found':
        throw GUARDIAN_REVIEW_NOT_FOUND();
      case 'conflict':
        throw GUARDIAN_REVIEW_CONFLICT();
      case 'stale':
        throw GUARDIAN_REVIEW_STALE();
      case 'approved':
      case 'rejected': {
        const { email, childFirstName, closed } = outcome;
        const notice =
          input.decision === 'approve'
            ? ({ outcome: 'approved' } as const)
            : ({ outcome: 'rejected', reason: input.reason, closed } as const);
        this.mail.sendLater('guardian_link_decision', () =>
          this.mailer.sendGuardianLinkDecision(email, childFirstName, notice),
        );
        if (input.decision === 'reject' && input.reason === 'suspected_forgery') {
          // Alerte sécurité : identifiant du dépôt seulement.
          this.logger.error(
            { event: 'guardian.link.suspected_forgery', reviewId },
            'Justificatif de lien : faux suspecté',
          );
        }
        this.logger.info(
          { event: `guardian.link.${outcome.outcome}`, closed },
          'Décision sur un justificatif de lien',
        );
        return { status: outcome.outcome, closed };
      }
    }
  }

  /** Texte en vigueur d'un consentement de tuteur, à présenter tel quel. */
  async consentText(type: GuardianConsentType): Promise<ConsentTextOutput> {
    const text = await currentConsentText(this.db, type);
    // Les deux textes sont posés par la migration : leur absence est une panne, pas un 404.
    if (text === null) throw new Error('Texte de consentement absent.');
    return {
      type,
      version: text.version,
      body: text.body,
      sha256: text.sha256,
      publishedAt: text.publishedAt.toISOString(),
    };
  }

  /** Consentement ré-authentifié du tuteur au lien approuvé (EX-108 n° 3 et 4). */
  async grantConsent(
    userId: string,
    ozId: string,
    input: GuardianConsentGrantInput,
  ): Promise<GuardianConsentOutput> {
    await this.reauthentication.verify(userId, input, GUARDIAN_REAUTH_REJECTED);
    const outcome = await withUserContext(this.db, userId, (tx) =>
      grantGuardianConsent(tx, {
        ozId,
        type: input.type,
        textVersion: input.textVersion,
        textSha256: input.textSha256,
      }),
    );
    switch (outcome.outcome) {
      case 'not_found':
        throw GUARDIAN_LINK_NOT_FOUND();
      case 'stale':
        throw CONSENT_TEXT_STALE();
      case 'requires_data_processing':
        throw CONSENT_REQUIRES_DATA_PROCESSING();
      case 'granted':
      case 'already':
        if (outcome.outcome === 'granted') {
          this.logger.info(
            { event: 'guardian.consent.granted', type: input.type },
            'Consentement du tuteur',
          );
        }
        return {
          type: input.type,
          textVersion: outcome.textVersion,
          grantedAt: outcome.grantedAt.toISOString(),
        };
    }
  }

  /** Révocation par le tuteur (EX-108 n° 5) : dépublication dans la même transaction. */
  async revokeConsent(
    userId: string,
    ozId: string,
    type: GuardianConsentType,
  ): Promise<GuardianConsentRevokeOutput> {
    const outcome = await withUserContext(this.db, userId, (tx) =>
      revokeGuardianConsent(tx, ozId, type),
    );
    if (outcome.outcome === 'not_found') throw GUARDIAN_LINK_NOT_FOUND();
    if (outcome.revoked > 0) {
      this.logger.info({ event: 'guardian.consent.revoked', type }, 'Consentement retiré');
    }
    return { revoked: outcome.revoked };
  }

  private auth(): { appUrl: string; columnEncryptionKey: string } {
    const auth = this.config.auth;
    // Le module n'est monté qu'avec FEATURE_AUTH : la configuration est toujours là.
    if (auth === undefined) throw new Error('Configuration des comptes absente.');
    return { appUrl: auth.appUrl, columnEncryptionKey: auth.columnEncryptionKey };
  }
}
