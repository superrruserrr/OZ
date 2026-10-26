import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { InputValidationException } from '../errors/api-error.js';

/**
 * Validation C2 (§7.1, EX-T04) : l'entrée est validée par le schéma de `@oz/contracts` avant toute
 * logique métier. Échec → 422 `VALIDATION_FAILED` ; succès → objet parsé (normalisé, sans champ inconnu).
 */
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  Promise<z.output<TSchema>>
> {
  constructor(private readonly schema: TSchema) {}

  // Asynchrone : un schéma peut contenir des règles asynchrones (safeParse lèverait alors une erreur).
  async transform(value: unknown): Promise<z.output<TSchema>> {
    const result = await this.schema.safeParseAsync(value);
    if (!result.success) throw new InputValidationException(result.error);
    return result.data;
  }
}
