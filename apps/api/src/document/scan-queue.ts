import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { documentScanJobSchema } from '@oz/contracts';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../database/database.module.js';

/** File entre l'API et le worker (lot 1.9b) : un document `pending` à analyser. */
export const DOCUMENT_SCAN_QUEUE = 'document-scan';

/** Producteur de la file `document-scan` ; le message ne porte que l'identifiant du document. */
@Injectable()
export class ScanQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@Inject(REDIS_CLIENT) redis: Redis) {
    // Connexion partagée : BullMQ ne la ferme pas, `DatabaseModule` s'en charge.
    this.queue = new Queue(DOCUMENT_SCAN_QUEUE, { connection: redis });
  }

  /**
   * Met le document en file, une seule fois : l'identifiant du document sert d'identifiant de job,
   * une réception rejouée ne crée pas de second job. Le reste est relu en base par le worker.
   */
  async enqueue(documentId: string): Promise<void> {
    const job = documentScanJobSchema.parse({ documentId });
    await this.queue.add('scan-document', job, {
      jobId: documentId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
