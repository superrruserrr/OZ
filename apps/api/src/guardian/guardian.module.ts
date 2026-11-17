import { Module, type DynamicModule } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { GuardianController } from './guardian.controller.js';
import { GuardianService } from './guardian.service.js';

/**
 * Tuteur légal (lot 1.7ba) : invitation, acceptation, enfants rattachés. Monté avec
 * l'authentification, avant le module joueur : `players/me/guardian/invitation` est une route fixe
 * que `players/:ozId/…` capterait sinon.
 */
@Module({})
export class GuardianModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: GuardianModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [GuardianController],
      providers: [GuardianService],
    };
  }
}
