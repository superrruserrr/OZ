import { Inject, Injectable } from '@nestjs/common';
import { generateRefreshToken, hashRefreshToken, type AccessTokens } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type { AccessTokenOutput, LoginInput } from '@oz/contracts';
import {
  accountEmail,
  logoutSession,
  openSession,
  rotateSession,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import { AppException } from '../common/errors/api-error.js';
import { DB_CLIENT } from '../database/database.module.js';
import {
  ACCESS_TOKENS,
  AUTH_CONFIG,
  AUTH_RESPONSE_FLOOR_MS,
  SESSION_FAMILY_TTL_SECONDS,
} from './auth.tokens.js';
import { CredentialsService } from './credentials.service.js';
import { deviceLabel } from './device.js';
import { AUTH_MAILER, type AuthMailer } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import { withResponseFloor } from './response-floor.js';

/** Contexte de la requête retenu pour la session : jamais l'IP complète ni le User-Agent brut en base. */
export interface ClientContext {
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
}

/** Session ouverte ou prolongée : jeton d'accès pour le corps, jeton de rafraîchissement pour le cookie. */
export interface IssuedSession {
  readonly access: AccessTokenOutput;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

/**
 * Libellé d'un client sans User-Agent reconnu (curl, client d'API) : traité comme un appareil à part
 * entière, il n'envoie un email « nouvel appareil » qu'à sa première connexion (D5).
 */
const UNIDENTIFIED_DEVICE = 'Appareil non identifié';

/** Réponse générique : ne dit jamais si l'email existe ni pourquoi l'accès est refusé (CP-28). */
const INVALID_CREDENTIALS = (): AppException =>
  new AppException(401, 'AUTH_INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
/** Rafraîchissement impossible : même réponse pour un jeton absent, inconnu, expiré ou rejoué. */
export const UNAUTHENTICATED = (): AppException =>
  new AppException(401, 'AUTH_UNAUTHENTICATED', 'Session expirée : reconnectez-vous.');

/** Accès refusé tant que l'adresse n'est pas confirmée (EX-103 n° 9). */
export const EMAIL_UNVERIFIED = (): AppException =>
  new AppException(
    403,
    'AUTH_EMAIL_UNVERIFIED',
    'Adresse email à confirmer : suivez le lien reçu par email.',
  );

/** Attente imposée par le délai exponentiel, portée jusqu'à l'en-tête Retry-After. */
export class RetryLaterException extends AppException {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'AUTH_RETRY_LATER', 'Trop de tentatives : réessayez plus tard.');
  }
}

/**
 * Sessions (lot 1.3b, EX-103 n° 1, 3 à 5, 8 à 10) : connexion, rotation du jeton de rafraîchissement
 * avec détection de réutilisation, déconnexion. Le jeton de rafraîchissement n'est conservé qu'en
 * empreinte HMAC ; le jeton d'accès ne porte que l'utilisateur et la famille.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(ACCESS_TOKENS) private readonly accessTokens: AccessTokens,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AUTH_RESPONSE_FLOOR_MS) private readonly floorMs: number,
    private readonly credentials: CredentialsService,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
  ) {}

  /**
   * Connexion : même réponse et même durée plancher que le compte existe ou non (CP-28). Un email non
   * vérifié n'est signalé qu'après un mot de passe juste (EX-103 n° 9).
   */
  async login(input: LoginInput, client: ClientContext): Promise<IssuedSession> {
    return withResponseFloor(this.floorMs, async () => {
      const verdict = await this.credentials.verify(input.email, input.password);
      switch (verdict.result) {
        case 'retry_later':
          throw new RetryLaterException(verdict.retryAfterSeconds);
        case 'invalid':
          throw INVALID_CREDENTIALS();
        case 'email_unverified':
          throw EMAIL_UNVERIFIED();
        case 'ok':
          break;
      }
      const now = new Date();
      const refreshToken = generateRefreshToken();
      const device = deviceLabel(client.userAgent) ?? UNIDENTIFIED_DEVICE;
      const opened = await openSession(this.db, {
        userId: verdict.userId,
        tokenHash: hashRefreshToken(refreshToken, this.config.tokens.refreshKey),
        device,
        ip: client.ip ?? null,
        ttlSeconds: this.config.tokens.refreshTtlSeconds,
        familyTtlSeconds: SESSION_FAMILY_TTL_SECONDS,
      });
      // Compte suspendu entre la vérification du mot de passe et l'ouverture : même refus générique.
      if (opened === null) throw INVALID_CREDENTIALS();
      // D5 : appareil inconnu depuis 90 jours, le titulaire est prévenu (après la réponse).
      if (!opened.knownDevice) {
        this.mail.sendLater('new_device_login', () =>
          this.mailer.sendNewDeviceLogin(input.email, device, now),
        );
      }
      const access = await this.accessTokens.issue(
        { userId: verdict.userId, familyId: opened.familyId },
        now,
      );
      return {
        access: { accessToken: access.token, expiresIn: access.expiresIn },
        refreshToken,
        refreshExpiresAt: opened.expiresAt,
      };
    });
  }

  /** Rotation : un jeton déjà consommé révoque toute la famille (EX-103 n° 5) et répond 401. */
  async refresh(token: string | null, client: ClientContext): Promise<IssuedSession> {
    if (token === null) throw UNAUTHENTICATED();
    const now = new Date();
    const next = generateRefreshToken();
    const result = await rotateSession(this.db, {
      tokenHash: hashRefreshToken(token, this.config.tokens.refreshKey),
      newTokenHash: hashRefreshToken(next, this.config.tokens.refreshKey),
      ip: client.ip ?? null,
      ttlSeconds: this.config.tokens.refreshTtlSeconds,
    });
    if (result.outcome === 'reuse') this.alertReuse(result.userId, now);
    if (result.outcome !== 'rotated') throw UNAUTHENTICATED();
    const access = await this.accessTokens.issue(
      { userId: result.userId, familyId: result.familyId },
      now,
    );
    return {
      access: { accessToken: access.token, expiresIn: access.expiresIn },
      refreshToken: next,
      refreshExpiresAt: result.expiresAt,
    };
  }

  /** Déconnexion de l'appareil : révoque la famille du cookie s'il est encore valide. */
  async logout(token: string | null): Promise<void> {
    if (token === null) return;
    await logoutSession(this.db, hashRefreshToken(token, this.config.tokens.refreshKey));
  }

  /** Réutilisation détectée : alerte au titulaire, adresse relue hors du temps de réponse. */
  private alertReuse(userId: string, when: Date): void {
    this.mail.sendLater('session_reuse_alert', async () => {
      const address = await withUserContext(this.db, userId, (tx) => accountEmail(tx));
      if (address !== null) await this.mailer.sendSessionReuseAlert(address, when);
    });
  }
}
