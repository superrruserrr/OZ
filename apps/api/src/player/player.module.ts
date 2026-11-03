import { Module, type DynamicModule } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PlayerProfileController } from './player-profile.controller.js';
import { PlayerProfileService } from './player-profile.service.js';

/** Fiche joueur (lot 1.13a) : montée avec l'authentification, ses routes reposent sur la session. */
@Module({})
export class PlayerModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: PlayerModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [PlayerProfileController],
      providers: [PlayerProfileService],
    };
  }
}
