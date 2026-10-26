import { Body } from '@nestjs/common';
import type { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/** Corps de requête validé par un schéma de contrat : `@ValidatedBody(sendContactMessageSchema)`. */
export function ValidatedBody(schema: z.ZodType): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
