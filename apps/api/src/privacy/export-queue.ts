import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { dataExportJobSchema } from '@oz/contracts';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../database/database.module.js';

/** File entre l'API et le worker (lot 1.16bb) : une demande d'export acceptée à produire. */
export const DATA_EXPORT_QUEUE = 'data-export';

/** Producteur de la file `data-export` ; le message ne porte que l'identifiant de la demande. */
@Injectable()
export class ExportQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@Inject(REDIS_CLIENT) redis: Redis) {
    // Connexion partagée : BullMQ ne la ferme pas, `DatabaseModule` s'en charge.
    this.queue = new Queue(DATA_EXPORT_QUEUE, { connection: redis });
  }

  /**
   * Met la demande en file, une seule fois (identifiant de la demande = identifiant du job), avec
   * les options du worker (`apps/worker/src/data-export.ts`, D6 : 3 essais).
   */
  async enqueue(requestId: string): Promise<void> {
    const job = dataExportJobSchema.parse({ requestId });
    await this.queue.add('build-export', job, {
      jobId: requestId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
