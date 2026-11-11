import { Inject, Injectable } from '@nestjs/common';
import { generateRefreshToken, hashRefreshToken, type AccessTokens } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type {
  AccessTokenOutput,
  LoginInput,
  LoginTwoFactorInput,
  TwoFactorChallengeOutput,
} from '@oz/contracts';
import {
  accountEmail,
  logoutSession,
  openSession,
  rotateSession,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import {
  ACCESS_TOKENS,
  AUTH_CONFIG,
  AUTH_RESPONSE_FLOOR_MS,
  LOGIN_CHALLENGE_TTL_SECONDS,
  SESSION_FAMILY_TTL_SECONDS,
} from './auth.tokens.js';
import { CredentialsService } from './credentials.service.js';
import { deviceLabel } from './device.js';
import { AUTH_MAILER, type AuthMailer } from './mail/auth-mailer.js';
import { MailDispatcher } from './mail/mail-dispatcher.js';
import {
  EMAIL_UNVERIFIED,
  INVALID_CREDENTIALS,
  REFRESH_RACED,
  RetryLaterException,
  TWO_FACTOR_INVALID,
  UNAUTHENTICATED,
} from './errors.js';
import { LoginChallengeService } from './login-challenge.service.js';
import { withResponseFloor } from './response-floor.js';
import { TwoFactorService } from './two-factor.service.js';

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
    private readonly limiter: RateLimiter,
    private readonly twoFactor: TwoFactorService,
    private readonly challenges: LoginChallengeService,
    @InjectPinoLogger(SessionService.name)
    private readonly logger: Pick<PinoLogger, 'info' | 'warn'>,
  ) {}

  /**
   * Connexion : même réponse et même durée plancher que le compte existe ou non (CP-28). Un email non
   * vérifié n'est signalé qu'après un mot de passe juste (EX-103 n° 9).
   */
  async login(
    input: LoginInput,
    client: ClientContext,
  ): Promise<IssuedSession | TwoFactorChallengeOutput> {
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
      const device = deviceLabel(client.userAgent) ?? UNIDENTIFIED_DEVICE;
      const state = await this.twoFactor.state(verdict.userId);
      // Compte suspendu entre la vérification du mot de passe et cette lecture.
      if (state === null) throw INVALID_CREDENTIALS();
      // 2FA active (D4) : aucune session, aucun email « nouvel appareil » avant le second facteur.
      if (state.secret !== null) {
        const challengeToken = await this.challenges.issue({
          userId: verdict.userId,
          device,
          credentialStamp: state.credentialStamp,
        });
        return {
          status: '2fa_required' as const,
          challengeToken,
          expiresIn: LOGIN_CHALLENGE_TTL_SECONDS,
        };
      }
      return this.open(verdict.userId, device, client);
    });
  }

  /** Second temps de la connexion (D4) : même refus pour un défi inconnu ou un code faux. */
  async loginTwoFactor(input: LoginTwoFactorInput, client: ClientContext): Promise<IssuedSession> {
    const challenge = await this.challenges.attempt(input.challengeToken);
    if (challenge === null) throw TWO_FACTOR_INVALID();
    const { userId, device, credentialStamp } = challenge;
    const decision = await this.limiter.consume('login_totp_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const state = await this.twoFactor.state(userId);
    // Compte suspendu, ou mot de passe changé depuis le défi : le code n'est pas évalué.
    if (state === null || state.credentialStamp !== credentialStamp) throw TWO_FACTOR_INVALID();
    if (!(await this.twoFactor.checkSecondFactor(userId, state, input.code))) {
      throw TWO_FACTOR_INVALID();
    }
    if (!(await this.challenges.consume(input.challengeToken))) throw TWO_FACTOR_INVALID();
    return this.open(userId, device, client);
  }

  private async open(
    userId: string,
    device: string,
    client: ClientContext,
  ): Promise<IssuedSession> {
    const now = new Date();
    const refreshToken = generateRefreshToken();
    const opened = await openSession(this.db, {
      userId,
      tokenHash: hashRefreshToken(refreshToken, this.config.tokens.refreshKey),
      device,
      ip: client.ip ?? null,
      ttlSeconds: this.config.tokens.refreshTtlSeconds,
      familyTtlSeconds: SESSION_FAMILY_TTL_SECONDS,
    });
    // Compte suspendu entre la vérification du mot de passe et l'ouverture : même refus générique.
    if (opened === null) throw INVALID_CREDENTIALS();
    // D5 : appareil inconnu depuis 90 jours, le titulaire est prévenu (après la réponse), au plus
    // `new_device_email` fois par jour et par compte (D7 du lot 1.3ca) ; la connexion réussit quand même.
    if (!opened.knownDevice) {
      this.mail.sendLater('new_device_login', async () => {
        let capped: boolean;
        try {
          capped = !(await this.limiter.consume('new_device_email', userId)).allowed;
        } catch {
          // Redis en panne : alerte non envoyée (D3), signalée comme telle et non comme panne SMTP.
          this.logger.warn(
            { event: 'auth.mail.cap_unavailable', kind: 'new_device_login' },
            'Plafond des emails « nouvel appareil » illisible : non envoyé',
          );
          return;
        }
        if (capped) {
          this.logger.info(
            { event: 'auth.mail.capped', kind: 'new_device_login' },
            'Plafond des emails « nouvel appareil » atteint : non envoyé',
          );
          return;
        }
        const address = await withUserContext(this.db, userId, (tx) => accountEmail(tx));
        if (address !== null) await this.mailer.sendNewDeviceLogin(address, device, now);
      });
    }
    const access = await this.accessTokens.issue({ userId, familyId: opened.familyId }, now);
    return {
      access: { accessToken: access.token, expiresIn: access.expiresIn },
      refreshToken,
      refreshExpiresAt: opened.expiresAt,
    };
  }

  /**
   * Rotation : un jeton déjà consommé révoque toute la famille (EX-103 n° 5) et répond 401, sauf le
   * dernier jeton consommé présenté dans les 10 s (deux onglets, D-132) : 409, sans jeton.
   */
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
    if (result.outcome === 'raced') throw REFRESH_RACED();
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
