import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import {
  documentUploadCompleteOutputSchema,
  documentUploadOutputSchema,
  documentUploadSchema,
  type DocumentUploadCompleteOutput,
  type DocumentUploadInput,
  type DocumentUploadOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { DocumentService } from './document.service.js';

/**
 * Dépôt de documents (lot 1.9a, EX-110). `@Can` décide au niveau du type (l'administrateur n'y a
 * pas droit, D5) ; le service décide ensuite sur la cible, et répond 404 sans droit.
 */
@ApiTags('documents')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Aucun rôle ne permet de déposer' })
@Can('document.upload')
@Controller('documents/upload')
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Demander une URL de dépôt',
    description:
      'Délivre une URL PUT signée, valable 5 minutes et à usage unique. Le fichier est envoyé tel quel avec les en-têtes rendus ; le stockage refuse tout autre type, taille ou empreinte.',
  })
  @ApiBody({ schema: openApiBodySchema(documentUploadSchema) })
  @ApiCreatedResponse({
    description: 'URL de dépôt délivrée',
    schema: openApiBodySchema(documentUploadOutputSchema),
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Cible inconnue ou hors de vos droits' })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Demande invalide' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 20 demandes dans l’heure',
    headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
  })
  issue(
    @CurrentActor() actor: Actor,
    @ValidatedBody(documentUploadSchema) input: DocumentUploadInput,
  ): Promise<DocumentUploadOutput> {
    return this.documents.issue(actor, input);
  }

  @Post(':id/complete')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Réceptionner un dépôt',
    description:
      'Vérifie le fichier reçu (taille, type réel lu dans ses premiers octets), le met en quarantaine et enregistre le document en attente d’analyse. Jamais lisible avant d’être déclaré sain.',
  })
  // Identifiant non validé ici : mal formé, il reçoit le même 404 qu'un dépôt inconnu.
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({
    description: 'Document enregistré, en attente d’analyse',
    schema: openApiBodySchema(documentUploadCompleteOutputSchema),
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Dépôt inconnu ou hors de vos droits' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Dépôt déjà traité ou fichier absent' })
  @ApiResponse({ status: 410, type: ApiErrorDto, description: 'Délai de dépôt dépassé' })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description: 'Fichier refusé : taille ou type réel différents de la demande',
  })
  @ApiServiceUnavailableResponse({ type: ApiErrorDto, description: 'File d’analyse indisponible' })
  complete(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<DocumentUploadCompleteOutput> {
    return this.documents.complete(actor, id);
  }
}
