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
import { DocumentReadController } from './document-read.controller.js';
import { DocumentReadService } from './document-read.service.js';
import { DocumentController } from './document.controller.js';
import { DocumentService } from './document.service.js';
import { DOCUMENT_STORAGE } from './document.tokens.js';
import { ScanQueue } from './scan-queue.js';

/** Ferme le client S3 à l'arrêt de l'application. */
@Injectable()
class StorageLifecycle implements OnModuleDestroy {
  constructor(@Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage) {}

  onModuleDestroy(): void {
    this.storage.destroy();
  }
}

/** Coffre documentaire (lots 1.9a et 1.9ca : dépôt et lecture) : monté seulement si FEATURE_DOCUMENTS=true (R13, D7). */
@Module({})
export class DocumentModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: DocumentModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [DocumentController, DocumentReadController],
      providers: [
        DocumentService,
        DocumentReadService,
        ScanQueue,
        StorageLifecycle,
        {
          provide: DOCUMENT_STORAGE,
          inject: [API_CONFIG],
          useFactory: (config: ApiConfig) => new DocumentStorage(config.s3),
        },
      ],
    };
  }
}
