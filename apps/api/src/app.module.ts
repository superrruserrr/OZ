import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { ApiConfig } from '@oz/config';
import type { DestinationStream } from 'pino';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { ConfigModule } from './config/config.module.js';
import { ContactModule } from './contact/contact.module.js';
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
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
