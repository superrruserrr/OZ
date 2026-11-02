import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import { documentReadOutputSchema, type DocumentReadOutput } from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { DocumentReadService } from './document-read.service.js';

/**
 * Lecture des documents (lot 1.9ca, EX-110 n° 6). `@Can` décide au niveau du type ; le service
 * décide ensuite sur la pièce, et répond 404 sans droit.
 */
@ApiTags('documents')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Aucun rôle ne permet de lire' })
@Can('document.read')
@Controller('documents')
export class DocumentReadController {
  constructor(private readonly documents: DocumentReadService) {}

  @Get(':id/url')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Obtenir une URL de lecture',
    description:
      'Délivre une URL GET signée, valable 5 minutes, pour une pièce déclarée saine. Le fichier est servi en téléchargement avec son type réel ; chaque URL délivrée est inscrite au journal d’audit.',
  })
  // Identifiant non validé ici : mal formé, il reçoit le même 404 qu'une pièce inconnue.
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    description: 'URL de lecture délivrée',
    schema: openApiBodySchema(documentReadOutputSchema),
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Pièce inconnue, non saine, purgée ou hors de vos droits',
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 120 demandes dans l’heure',
    headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
  })
  read(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<DocumentReadOutput> {
    return this.documents.read(actor, id);
  }
}
