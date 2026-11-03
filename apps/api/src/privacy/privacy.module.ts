import { Module, type DynamicModule } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { DataExportController } from './data-export.controller.js';
import { DataExportService } from './data-export.service.js';

/** Droits de la personne sur ses données (lot 1.16ba) : monté avec l'authentification. */
@Module({})
export class PrivacyModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: PrivacyModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [DataExportController],
      providers: [DataExportService],
    };
  }
}
