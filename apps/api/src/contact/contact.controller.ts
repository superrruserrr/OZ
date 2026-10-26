import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiPayloadTooLargeResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { sendContactMessageSchema, type SendContactMessageInput } from '@oz/contracts';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';

// Documentation générée depuis le schéma du contrat : elle ne peut pas diverger de la validation.
// Documentation générée depuis le contrat (entrée + formats) : elle ne peut pas diverger de la validation.
const contactBodySchema = openApiBodySchema(sendContactMessageSchema);

/**
 * Formulaire de contact du site public — premier contrat partagé (lot 0.5).
 * Monté seulement si FEATURE_CONTACT_FORM=true (interdit en production avant les lots 1.3 et 1.15).
 * Rien n'est stocké ni journalisé du contenu : l'envoi réel arrive avec les emails (lot 1.15).
 */
@ApiTags('contact')
@Controller('contact')
export class ContactController {
  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Envoyer un message de contact (public, derrière un drapeau)' })
  @ApiBody({ schema: contactBodySchema })
  @ApiAcceptedResponse({
    description: 'Message reçu',
    schema: { type: 'object', properties: { status: { type: 'string', enum: ['received'] } } },
  })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Corps illisible (JSON malformé…)' })
  @ApiPayloadTooLargeResponse({ type: ApiErrorDto, description: 'Corps trop volumineux' })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Données invalides' })
  send(@ValidatedBody(sendContactMessageSchema) _input: SendContactMessageInput): {
    status: 'received';
  } {
    return { status: 'received' };
  }
}
