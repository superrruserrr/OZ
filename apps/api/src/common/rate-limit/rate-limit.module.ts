import { Module, type DynamicModule } from '@nestjs/common';
import { readSetting, type PrismaClient } from '@oz/db';
import { DatabaseModule, DB_CLIENT } from '../../database/database.module.js';
import {
  RATE_LIMIT_CACHE_MS,
  RATE_LIMIT_KEY,
  RATE_LIMIT_SETTINGS,
  RateLimiter,
} from './rate-limiter.service.js';

/** Réglage relu au plus toutes les 30 s : une modification s'applique sans redéploiement (D2). */
const SETTINGS_CACHE_MS = 30_000;

/** Limiteur de débit partagé (lot 1.3ca), monté avec la clé HMAC des compteurs. */
@Module({})
export class RateLimitModule {
  static forRoot(key: string): DynamicModule {
    return {
      module: RateLimitModule,
      imports: [DatabaseModule],
      providers: [
        RateLimiter,
        { provide: RATE_LIMIT_KEY, useValue: key },
        { provide: RATE_LIMIT_CACHE_MS, useValue: SETTINGS_CACHE_MS },
        {
          provide: RATE_LIMIT_SETTINGS,
          inject: [DB_CLIENT],
          useFactory: (db: PrismaClient) => () => readSetting(db, 'rate_limits'),
        },
      ],
      exports: [RateLimiter],
    };
  }
}
