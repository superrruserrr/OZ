import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ApiConfig } from '@oz/config';

/** Jeton d'injection de la configuration validée au démarrage. */
export const API_CONFIG = Symbol('API_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: API_CONFIG, useValue: config }],
      exports: [API_CONFIG],
    };
  }
}
