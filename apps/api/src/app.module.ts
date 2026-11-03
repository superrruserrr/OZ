import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { ApiConfig } from '@oz/config';
import type { DestinationStream } from 'pino';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DefaultDenyGuard } from './authorization/default-deny.guard.js';
import { PayloadGuardInterceptor } from './authorization/payload-guard.interceptor.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { ConfigModule } from './config/config.module.js';
import { ContactModule } from './contact/contact.module.js';
import { DocumentModule } from './document/document.module.js';
import { HealthModule } from './health/health.module.js';

export interface AppOptions {
  /** Flux de sortie des logs (tests) ; par défaut la sortie standard. */
  readonly logStream?: DestinationStream;
}

@Module({})
export class AppModule {
  static forRoot(config: ApiConfig, options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config, options.logStream),
        HealthModule,
        // Drapeau R13 : le module n'existe pas du tout quand il est désactivé (404).
        ...(config.features.contactForm ? [ContactModule] : []),
        ...(config.auth ? [AuthModule.forRoot(config.auth)] : []),
        // Journal d'audit (lot 1.16a) : réservé à l'administrateur, repose sur la session.
        ...(config.auth ? [AuditModule.forRoot(config.auth.hmacKey)] : []),
        // FEATURE_DOCUMENTS exige FEATURE_AUTH (configuration) : les routes reposent sur la session.
        ...(config.features.documents && config.auth
          ? [DocumentModule.forRoot(config.auth.hmacKey)]
          : []),
      ],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: DefaultDenyGuard },
        { provide: APP_INTERCEPTOR, useClass: PayloadGuardInterceptor },
      ],
    };
  }
}
