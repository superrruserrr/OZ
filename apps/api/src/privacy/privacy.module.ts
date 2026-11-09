import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ApiConfig } from '@oz/config';
import { DocumentStorage } from '@oz/storage';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { API_CONFIG } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { DataExportController } from './data-export.controller.js';
import { DataExportService } from './data-export.service.js';
import { ExportQueue } from './export-queue.js';
import { EXPORT_STORAGE } from './privacy.tokens.js';
import { Reauthentication } from './reauthentication.js';

/** Ferme le client S3 à l'arrêt de l'application. */
@Injectable()
class StorageLifecycle implements OnModuleDestroy {
  constructor(@Inject(EXPORT_STORAGE) private readonly storage: DocumentStorage) {}

  onModuleDestroy(): void {
    this.storage.destroy();
  }
}

/**
 * Droits de la personne sur ses données (lots 1.16ba, 1.16bb et 1.16ca : export, suppression) : monté avec l'authentification.
 * Les archives sont produites par le worker (file `data-export`) et servies par URL signée.
 */
@Module({})
export class PrivacyModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: PrivacyModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [DataExportController, AccountDeletionController],
      providers: [
        DataExportService,
        AccountDeletionService,
        Reauthentication,
        ExportQueue,
        StorageLifecycle,
        {
          provide: EXPORT_STORAGE,
          inject: [API_CONFIG],
          useFactory: (config: ApiConfig) => new DocumentStorage(config.s3),
        },
      ],
    };
  }
}
