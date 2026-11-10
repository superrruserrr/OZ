import { Module, type DynamicModule } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PlayerProfileController } from './player-profile.controller.js';
import { PlayerProfileService } from './player-profile.service.js';
import { PlayerSearchController } from './player-search.controller.js';
import { PlayerSearchService } from './player-search.service.js';
import { SavedSearchController } from './saved-search.controller.js';
import { SavedSearchService } from './saved-search.service.js';
import { SearchExportController } from './search-export.controller.js';
import { SearchExportService } from './search-export.service.js';

/**
 * Fiche joueur (lot 1.13a), recherche (lot 1.14a), recherches sauvegardées et export (lot 1.14b) :
 * montée avec l'authentification. Les routes fixes (`saved-searches`, `export.csv`) sont déclarées
 * avant `:ozId`, qui les capterait sinon.
 */
@Module({})
export class PlayerModule {
  static forRoot(hmacKey: string): DynamicModule {
    return {
      module: PlayerModule,
      imports: [DatabaseModule, RateLimitModule.forRoot(hmacKey)],
      controllers: [
        PlayerSearchController,
        SavedSearchController,
        SearchExportController,
        PlayerProfileController,
      ],
      providers: [
        PlayerProfileService,
        PlayerSearchService,
        SavedSearchService,
        SearchExportService,
      ],
    };
  }
}
