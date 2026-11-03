import { Module, type DynamicModule } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';

/** Consultation du journal d'audit (lot 1.16a) : montée avec l'authentification. */
@Module({})
export class AuditModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: AuditModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [AuditLogController],
      providers: [AuditLogService],
    };
  }
}
