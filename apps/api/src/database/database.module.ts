import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { redisTlsOptions, type ApiConfig } from '@oz/config';
import { createDbClient, type PrismaClient } from '@oz/db';
import { Redis } from 'ioredis';
import { API_CONFIG } from '../config/config.module.js';

/** Client Prisma partagé (rôle applicatif, RLS forcée : aucun contexte posé par défaut). */
export const DB_CLIENT = Symbol('DB_CLIENT');
/** Client Redis partagé (compteurs d'échecs, limites de débit). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Ferme proprement les connexions à l'arrêt de l'application. */
@Injectable()
class ConnectionsLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.db.$disconnect(), this.redis.quit()]);
  }
}

@Module({
  providers: [
    {
      provide: DB_CLIENT,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig): PrismaClient =>
        createDbClient(config.databaseUrl, config.databaseCaCert),
    },
    {
      provide: REDIS_CLIENT,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig): Redis =>
        new Redis(config.redisUrl, {
          ...redisTlsOptions(config.redisUrl, config.redisCaCert),
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        }),
    },
    ConnectionsLifecycle,
  ],
  exports: [DB_CLIENT, REDIS_CLIENT],
})
export class DatabaseModule {}
