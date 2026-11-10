import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import {
  PLAYER_SEARCH_SORTS,
  playerSearchExportQuerySchema,
  type PlayerSearchExportQueryOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { SearchExportService } from './search-export.service.js';

const text = { required: false, type: String } as const;
const integer = { required: false, type: Number } as const;

/** Export CSV de la recherche (lot 1.14b, EX-116 n° 4) : `@Can` au niveau du type, la portée au service. */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@Controller('players')
export class SearchExportController {
  constructor(private readonly exports: SearchExportService) {}

  @Get('export.csv')
  @Can('player.search')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporter une recherche en CSV',
    description:
      'Mêmes critères et tri que `GET /players`, sans pagination : les joueurs visibles du lecteur, chacun dans la vue de sa fiche, sans téléphone, bornés au nombre de lignes du palier. Club, fédération, recruteur vérifié et administrateur ; une académie n’exporte pas. Quota d’exports par 24 heures glissantes, par organisation imputée (`quotaOrganizationId`, requis pour un membre de plusieurs organisations) ; palier gratuit par défaut. Fichier filigrané au nom du demandeur, une référence par ligne ; export et mineurs listés inscrits au journal d’audit.',
  })
  @ApiQuery({ name: 'country', ...text, description: 'Pays (ISO 3166-1 alpha-2)' })
  @ApiQuery({ name: 'region', ...text })
  @ApiQuery({ name: 'city', ...text })
  @ApiQuery({ name: 'ageMin', ...integer })
  @ApiQuery({ name: 'ageMax', ...integer })
  @ApiQuery({ name: 'position', ...text, description: 'Poste principal ou secondaire' })
  @ApiQuery({ name: 'foot', ...text })
  @ApiQuery({ name: 'heightMin', ...integer })
  @ApiQuery({ name: 'heightMax', ...integer })
  @ApiQuery({ name: 'weightMin', ...integer })
  @ApiQuery({ name: 'weightMax', ...integer })
  @ApiQuery({ name: 'verificationLevel', ...integer, description: 'Niveau de badge minimal' })
  @ApiQuery({ name: 'organizationId', ...text, description: 'Critère : organisation du joueur' })
  @ApiQuery({ name: 'q', ...text, description: 'Prénom ou nom' })
  @ApiQuery({ name: 'sort', required: false, enum: [...PLAYER_SEARCH_SORTS] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'quotaOrganizationId', ...text, description: 'Organisation imputée' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Fichier CSV UTF-8 (BOM), filigrané',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'Aucun export permis, critère réservé, ou organisation hors des vôtres',
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description: 'Critère invalide, ou organisation imputée à choisir',
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description:
      'Quota du palier épuisé (`EXPORT_QUOTA_EXCEEDED`, palier en détail) ou plus de 10 exports dans l’heure',
    headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
  })
  async export(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(playerSearchExportQuerySchema))
    query: PlayerSearchExportQueryOutput,
  ): Promise<StreamableFile> {
    const file = await this.exports.export(actor, query);
    // Nom neutre : ni nom ni OZ ID ; l'identifiant de l'export est dans le filigrane.
    return new StreamableFile(Buffer.from(file.csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="oz-recherche.csv"',
    });
  }
}
