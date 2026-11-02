import { Inject, Injectable } from '@nestjs/common';
import { abilityFor, documentSubject, type Actor } from '@oz/auth';
import type { DocumentReadOutput } from '@oz/contracts';
import {
  readableDocumentFor,
  recordDocumentRead,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import type { DocumentStorage } from '@oz/storage';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { DOCUMENT_STORAGE } from './document.tokens.js';
import { DOCUMENT_NOT_FOUND } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validité de l'URL de lecture (EX-110 n° 6, CP-22). */
export const READ_URL_SECONDS = 300;

/**
 * Lecture des documents (lot 1.9ca) : une pièce saine, visible du demandeur (RLS) et permise par
 * `document.read` (CASL), est servie par une URL GET signée de 5 minutes. La lecture est inscrite au
 * journal d'audit dans la même transaction, avant que l'URL n'existe : sans audit, aucune URL.
 */
@Injectable()
export class DocumentReadService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(DocumentReadService.name) private readonly logger: PinoLogger,
  ) {}

  /** Inconnue, cachée, non saine, supprimée, purgée ou sans droit : même 404 (CP-21). */
  async read(actor: Actor, documentId: string): Promise<DocumentReadOutput> {
    const decision = await this.limiter.consume('document_read_account', actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const document = await withUserContext(this.db, actor.userId, async (tx) => {
      const readable = await readableDocumentFor(tx, documentId);
      if (readable === null) return null;
      const { checkedAt, ...target } = readable.target;
      const subject = documentSubject({ ...target, documentType: readable.type }, checkedAt);
      if (!abilityFor(actor).can('document.read', subject)) return null;
      await recordDocumentRead(tx, actor.userId, { id: readable.id, type: readable.type });
      return readable;
    });
    if (document === null) {
      // Trace des sondages : identifiant seulement s'il est bien formé, jamais la valeur reçue.
      this.logger.info(
        { event: 'document.read.refused', ...(UUID.test(documentId) ? { documentId } : {}) },
        'Lecture refusée',
      );
      throw DOCUMENT_NOT_FOUND();
    }
    const signed = await this.storage.presignGet({
      key: document.storageKey,
      contentType: document.mimeType,
      expiresInSeconds: READ_URL_SECONDS,
    });
    // Ni l'URL ni la clé : l'identifiant suffit à relier le journal à l'audit.
    this.logger.info(
      { event: 'document.read.granted', documentId: document.id },
      'URL de lecture délivrée',
    );
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }
}
