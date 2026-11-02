import { Inject, Injectable } from '@nestjs/common';
import { abilityFor, documentSubject, type Actor, type RateLimitRule } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type {
  DocumentUploadCompleteOutput,
  DocumentUploadInput,
  DocumentUploadOutput,
} from '@oz/contracts';
import {
  completeDocumentUpload,
  createDocumentUpload,
  documentTargetFor,
  documentUploadFor,
  rejectDocumentUpload,
  withUserContext,
  type PrismaClient,
  type RejectReason,
  type TransactionClient,
  type UploadDocumentType,
  type UploadTarget,
} from '@oz/db';
import { incomingKey, quarantineKey, StorageChangedError, type DocumentStorage } from '@oz/storage';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { DOCUMENT_STORAGE } from './document.tokens.js';
import {
  DOCUMENT_NOT_FOUND,
  SCAN_UNAVAILABLE,
  UPLOAD_ALREADY_USED,
  UPLOAD_EXPIRED,
  UPLOAD_MISSING,
  UPLOAD_REJECTED,
} from './errors.js';
import { ScanQueue } from './scan-queue.js';
import { SNIFF_BYTES, sniffContentType } from './sniff.js';

/** Validité de l'URL de dépôt, égale à celle de l'intention en base (D1). */
export const UPLOAD_URL_SECONDS = 300;

/**
 * Durée maximale de la transaction de réception. Au-delà, la base annule ; l'objet reste en
 * `incoming/`, le dépôt reste réceptionnable. Elle couvre la copie (40 s au pire, voir `@oz/storage`)
 * et la mise en file (`ENQUEUE_TIMEOUT_MS`) ; `QUARANTINE_DEADLINE_MS` garantit qu'aucun job n'est
 * mis en file après qu'elle a pu échouer.
 */
const COMPLETE_TRANSACTION_MS = 60_000;
/** Passé ce délai depuis le début de la transaction, la copie est retirée et la mise en file abandonnée. */
export const QUARANTINE_DEADLINE_MS = 45_000;
/** Attente maximale de Redis pour la mise en file. */
export const ENQUEUE_TIMEOUT_MS = 5_000;

/** Rejette après `ms` : une promesse qui ne se règle jamais n'immobilise pas la transaction. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`délai de ${String(ms)} ms dépassé`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function targetOf(input: DocumentUploadInput): UploadTarget {
  if (input.playerId !== undefined) return { playerId: input.playerId };
  if (input.guardianId !== undefined) return { guardianId: input.guardianId };
  if (input.organizationId !== undefined) return { organizationId: input.organizationId };
  // Le contrat exige exactement une cible : une requête sans cible n'arrive pas jusqu'ici.
  throw new Error('Demande de dépôt sans cible.');
}

/**
 * Dépôt de documents (lot 1.9a, EX-110) : le binaire va droit au stockage par une URL signée, l'API
 * n'en voit que les métadonnées, puis vérifie le fichier réel à la réception.
 */
@Injectable()
export class DocumentService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly limiter: RateLimiter,
    private readonly scans: ScanQueue,
    @InjectPinoLogger(DocumentService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Intention de dépôt : droit vérifié sur la cible lue sous RLS, puis URL PUT signée de 5 minutes.
   * Sans droit, cible cachée ou inconnue : 404. L'audit de l'intention est écrit par la base.
   */
  async issue(actor: Actor, input: DocumentUploadInput): Promise<DocumentUploadOutput> {
    await this.limit('document_upload_account', actor.userId);
    const target = targetOf(input);
    const issued = await withUserContext(this.db, actor.userId, async (tx) => {
      if (!(await this.mayUpload(tx, actor, input.documentType, target))) return null;
      return createDocumentUpload(tx, {
        documentType: input.documentType,
        target,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
      });
    });
    if (issued === null) throw DOCUMENT_NOT_FOUND();
    const presigned = await this.storage.presignPut({
      key: incomingKey(issued.id),
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      sha256: input.sha256,
      expiresInSeconds: UPLOAD_URL_SECONDS,
    });
    // L'échéance annoncée est la plus proche des deux : URL signée et intention en base.
    const expiresAt =
      presigned.expiresAt < issued.expiresAt ? presigned.expiresAt : issued.expiresAt;
    return {
      uploadId: issued.id,
      url: presigned.url,
      method: 'PUT',
      headers: {
        'content-type': input.contentType,
        'content-length': String(input.sizeBytes),
        'x-amz-checksum-sha256': presigned.headers['x-amz-checksum-sha256'] ?? '',
      },
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Réception (D2, D3) : le fichier reçu doit avoir la taille et le type réel déclarés ; il passe
   * alors en quarantaine, le document est enregistré `pending` et mis en file d'analyse. Le droit
   * sur la cible est vérifié à nouveau : un rattachement retiré depuis l'intention ferme le dépôt.
   */
  async complete(actor: Actor, uploadId: string): Promise<DocumentUploadCompleteOutput> {
    await this.limit('document_complete_account', actor.userId);
    const upload = await withUserContext(this.db, actor.userId, async (tx) => {
      const row = await documentUploadFor(tx, uploadId);
      if (row === null) return null;
      return (await this.mayUpload(tx, actor, row.documentType, row.target)) ? row : null;
    });
    if (upload === null) throw DOCUMENT_NOT_FOUND();
    if (upload.status === 'expired') throw UPLOAD_EXPIRED();
    if (upload.status !== 'issued') throw UPLOAD_ALREADY_USED();
    const incoming = incomingKey(upload.id);
    let etag: string | undefined;
    if (!upload.expired) {
      const object = await this.storage.head(incoming);
      if (object === null) throw UPLOAD_MISSING();
      if (object.size !== upload.sizeBytes) {
        await this.reject(actor, upload.id, 'size_mismatch');
      }
      // Lu à la version vérifiée seulement : un objet disparu ou remplacé entre-temps (réception
      // concurrente, nouvel envoi) n'est pas un fichier déguisé.
      const head = await this.readVerified(incoming, object.etag);
      const detected = await sniffContentType(head);
      if (detected !== upload.contentType) {
        // Fichier déguisé (exécutable déclaré image, PDF renommé…) : alerte de sécurité.
        this.logger.warn(
          {
            event: 'document.upload.type_mismatch',
            userId: actor.userId,
            uploadId: upload.id,
            declared: upload.contentType,
            detected,
          },
          'Dépôt refusé : type réel différent du type déclaré',
        );
        await this.reject(actor, upload.id, 'type_mismatch');
      }
      etag = object.etag;
    }
    const result = await withUserContext(
      this.db,
      actor.userId,
      async (tx) => {
        const startedAt = Date.now();
        const outcome = await completeDocumentUpload(
          tx,
          upload.id,
          this.config.documentRetentionDays,
        );
        if (outcome.outcome === 'completed') {
          await this.quarantine(upload.id, outcome.documentId, etag, startedAt);
        }
        return outcome;
      },
      { timeoutMs: COMPLETE_TRANSACTION_MS },
    );
    switch (result.outcome) {
      case 'completed':
        // Après l'enregistrement seulement : un échec plus tôt laisse le dépôt intact.
        await this.discard(incoming);
        return { documentId: result.documentId, status: 'pending' };
      case 'expired':
        // L'objet éventuellement reçu après l'échéance ne servira jamais.
        await this.discard(incoming);
        throw UPLOAD_EXPIRED();
      case 'already_used':
        throw UPLOAD_ALREADY_USED();
      case 'not_found':
        throw DOCUMENT_NOT_FOUND();
    }
  }

  /** Droit `document.upload` de l'acteur sur la cible, lue sous RLS à l'instant de la base. */
  private async mayUpload(
    tx: TransactionClient,
    actor: Actor,
    documentType: UploadDocumentType,
    target: UploadTarget,
  ): Promise<boolean> {
    const record = await documentTargetFor(tx, target);
    if (record === null) return false;
    const subject = documentSubject(
      {
        documentType,
        kind: record.kind,
        ownerUserId: record.ownerUserId,
        guardianUserId: record.guardianUserId,
        organizationId: record.organizationId,
        birthDate: record.birthDate,
      },
      record.checkedAt,
    );
    return abilityFor(actor).can('document.upload', subject);
  }

  /** Rejet définitif : intention close, objet supprimé, réponse sans détail de l'écart. */
  private async reject(actor: Actor, uploadId: string, reason: RejectReason): Promise<never> {
    const rejected = await withUserContext(this.db, actor.userId, (tx) =>
      rejectDocumentUpload(tx, uploadId, reason),
    );
    await this.storage.remove(incomingKey(uploadId));
    // Une réception concurrente a pu passer avant : l'intention n'est plus ouverte.
    throw rejected ? UPLOAD_REJECTED() : UPLOAD_ALREADY_USED();
  }

  /** Octets de tête de la version vérifiée ; absente ou remplacée : 409, sans alerte. */
  private async readVerified(key: string, etag: string): Promise<Uint8Array> {
    try {
      const head = await this.storage.readHead(key, SNIFF_BYTES, etag);
      if (head === null) throw UPLOAD_MISSING();
      return head;
    } catch (error) {
      if (error instanceof StorageChangedError) throw UPLOAD_MISSING();
      throw error;
    }
  }

  /**
   * Copie en quarantaine (version vérifiée seulement) puis mise en file, dans la transaction de la
   * réception. `incoming/` n'est pas touché : tout échec annule l'enregistrement et laisse le dépôt
   * réceptionnable ; une mise en file impossible retire la copie et répond 503.
   */
  private async quarantine(
    uploadId: string,
    documentId: string,
    etag: string | undefined,
    startedAt: number,
  ): Promise<void> {
    const quarantined = quarantineKey(documentId);
    try {
      await this.storage.copy(incomingKey(uploadId), quarantined, etag);
    } catch (error) {
      if (error instanceof StorageChangedError) throw UPLOAD_MISSING();
      throw error;
    }
    // Copie trop lente : la transaction approche de son terme, aucun job ne doit lui survivre.
    if (Date.now() - startedAt > QUARANTINE_DEADLINE_MS) {
      this.logger.error(
        { event: 'document.upload.deadline_exceeded', documentId },
        'Réception abandonnée : copie en quarantaine trop lente',
      );
      await this.removeCopy(quarantined, documentId);
      throw SCAN_UNAVAILABLE();
    }
    try {
      await within(this.scans.enqueue(documentId), ENQUEUE_TIMEOUT_MS);
    } catch (error) {
      // Un ajout abandonné sur délai peut encore aboutir : le worker ignore un document absent (D-092).
      this.logger.error(
        { event: 'document.scan.enqueue_failed', documentId, err: error },
        'Mise en file d’analyse impossible',
      );
      await this.removeCopy(quarantined, documentId);
      throw SCAN_UNAVAILABLE();
    }
  }

  /** Retrait de la copie d'une réception abandonnée ; un échec laisse un orphelin journalisé (1.9c). */
  private async removeCopy(key: string, documentId: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.error(
        { event: 'document.scan.quarantine_cleanup_failed', documentId, err: error },
        'Copie en quarantaine non retirée',
      );
    }
  }

  /** Suppression de l'envoi réceptionné ; un échec laisse un objet orphelin, purgé au lot 1.9c. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.error(
        { event: 'document.upload.discard_failed', key, err: error },
        'Envoi réceptionné non supprimé',
      );
    }
  }

  private async limit(rule: RateLimitRule, subject: string): Promise<void> {
    const decision = await this.limiter.consume(rule, subject);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
