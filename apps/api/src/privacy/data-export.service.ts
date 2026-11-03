import { Inject, Injectable } from '@nestjs/common';
import type {
  DataExportDownloadOutput,
  DataExportOutput,
  DataExportRequestInput,
  DataExportStatusOutput,
} from '@oz/contracts';
import {
  accountEmail,
  dataExportDownloadKey,
  latestDataExport,
  requestDataExport,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import type { DocumentStorage } from '@oz/storage';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { CredentialsService } from '../auth/credentials.service.js';
import { RetryLaterException, UNAUTHENTICATED } from '../auth/errors.js';
import { AUTH_MAILER, type AuthMailer } from '../auth/mail/auth-mailer.js';
import { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { ExportQueue } from './export-queue.js';
import { EXPORT_STORAGE } from './privacy.tokens.js';

/** Délai entre deux demandes acceptées (D3), le même qu'en base (`oz_data_export_request`). */
const REQUEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** URL de l'archive : 5 minutes (D4, EX-110 n° 6). */
const DOWNLOAD_URL_SECONDS = 300;

/** Refus unique : ne dit jamais lequel, du mot de passe ou du code, est faux ou manque. */
const REJECTED = (): AppException =>
  new AppException(403, 'DATA_EXPORT_REJECTED', 'Mot de passe ou code incorrect.');
/** 409 avec `Retry-After` : l'attente jusqu'à la prochaine demande possible (D3). */
class DataExportTooSoonException extends AppException {
  constructor(readonly retryAfterSeconds: number) {
    super(409, 'DATA_EXPORT_TOO_SOON', 'Une seule demande d’export par 24 heures.');
  }
}

/**
 * Export des données personnelles (lot 1.16ba, EX-118 n° 2) : demande ré-authentifiée (D2), une à
 * la fois et au plus une par 24 heures (D3), décidée et auditée par la base ; l'archive est produite
 * par le worker (lot 1.16bb). Ni mot de passe ni code ne sont journalisés.
 */
@Injectable()
export class DataExportService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    private readonly credentials: CredentialsService,
    private readonly twoFactor: TwoFactorService,
    private readonly limiter: RateLimiter,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
    private readonly mail: MailDispatcher,
    private readonly queue: ExportQueue,
    @Inject(EXPORT_STORAGE) private readonly storage: DocumentStorage,
    @InjectPinoLogger(DataExportService.name) private readonly logger: PinoLogger,
  ) {}

  async request(userId: string, input: DataExportRequestInput): Promise<DataExportOutput> {
    const decision = await this.limiter.consume('data_export_request_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    await this.reauthenticate(userId, input);

    const outcome = await withUserContext(this.db, userId, (tx) => requestDataExport(tx));
    switch (outcome.outcome) {
      case 'refused':
        throw UNAUTHENTICATED();
      case 'active':
        throw new AppException(409, 'DATA_EXPORT_ACTIVE', 'Un export est déjà en cours ou prêt.');
      case 'too_soon':
        throw new DataExportTooSoonException(
          Math.max(1, Math.ceil((outcome.nextRequestAt.getTime() - Date.now()) / 1000)),
        );
      case 'accepted':
        break;
    }
    const when = outcome.requestedAt;
    // File indisponible : la demande reste `pending`, reprise par le balayage du worker (30 min).
    // Jamais de 500 après l'audit : la demande est enregistrée.
    try {
      await this.queue.enqueue(outcome.id);
    } catch (error) {
      this.logger.warn(
        {
          event: 'data.export.enqueue_failed',
          requestId: outcome.id,
          cause: error instanceof Error ? error.name : 'unknown',
        },
        'Mise en file différée',
      );
    }
    this.mail.sendLater('data_export_requested', async () => {
      const address = await this.emailOf(userId);
      if (address !== null) await this.mailer.sendDataExportRequested(address, when);
    });
    return {
      status: 'pending',
      requestedAt: when.toISOString(),
      readyAt: null,
      expiresAt: null,
      nextRequestAt: new Date(when.getTime() + REQUEST_INTERVAL_MS).toISOString(),
    };
  }

  /** Dernière demande du compte, ou `null` s'il n'en a jamais fait. */
  async latest(userId: string): Promise<DataExportStatusOutput> {
    const latest = await withUserContext(this.db, userId, (tx) => latestDataExport(tx));
    if (latest === null) return { latest: null };
    return {
      latest: {
        status: latest.status,
        requestedAt: latest.requestedAt.toISOString(),
        readyAt: latest.readyAt?.toISOString() ?? null,
        expiresAt: latest.expiresAt?.toISOString() ?? null,
        nextRequestAt: latest.nextRequestAt.toISOString(),
      },
    };
  }

  /**
   * URL signée de 5 minutes de l'archive prête et non échue du titulaire (D4). La délivrance est
   * auditée par la base (`data.export.downloaded`) avant la signature ; 404 sans archive.
   */
  async download(userId: string): Promise<DataExportDownloadOutput> {
    const decision = await this.limiter.consume('data_export_download_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const key = await withUserContext(this.db, userId, (tx) => dataExportDownloadKey(tx));
    if (key === null) {
      throw new AppException(404, 'DATA_EXPORT_NOT_FOUND', 'Aucune archive disponible.');
    }
    const signed = await this.storage.presignGet({
      key,
      contentType: 'application/json',
      expiresInSeconds: DOWNLOAD_URL_SECONDS,
    });
    // Ni l'URL ni la clé au journal.
    this.logger.info({ event: 'data.export.download_granted' }, 'URL d’archive délivrée');
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  /**
   * Mot de passe sous le délai exponentiel partagé avec la connexion, puis second facteur si la 2FA
   * est active (D2), comme `POST /auth/2fa/disable` : un code n'est consommé qu'après un mot de
   * passe juste (une faute de frappe ne coûte pas un code de secours). Oracle résiduel : D-114.
   */
  private async reauthenticate(userId: string, input: DataExportRequestInput): Promise<void> {
    const email = await this.emailOf(userId);
    if (email === null) throw UNAUTHENTICATED();
    const verdict = await this.credentials.verify(email, input.password);
    if (verdict.result === 'retry_later') throw new RetryLaterException(verdict.retryAfterSeconds);
    if (verdict.result !== 'ok') throw REJECTED();
    const state = await this.twoFactor.state(userId);
    if (state === null) throw UNAUTHENTICATED();
    if (state.secret === null) return;
    if (input.code === undefined) throw REJECTED();
    if (!(await this.twoFactor.checkSecondFactor(userId, state, input.code))) throw REJECTED();
  }

  private emailOf(userId: string): Promise<string | null> {
    return withUserContext(this.db, userId, (tx) => accountEmail(tx));
  }
}
