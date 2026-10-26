import type { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

type OpenApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
type JsonObject = Record<string, unknown>;

const UNICODE_PROPERTY = /\\p\{/;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Fusionne la description d'entrée et celle de sortie : l'entrée porte les contraintes du corps
 * reçu (longueurs…), la sortie les formats (email…). Les motifs à propriétés Unicode (\\p{…}),
 * inconnus des validateurs OpenAPI 3.0, sont remplacés par une description.
 */
function merge(input: unknown, output: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item, index) =>
      merge(item, Array.isArray(output) ? output[index] : undefined),
    );
  }
  if (!isObject(input)) return input;
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = merge(value, isObject(output) ? output[key] : undefined);
  }
  if (isObject(output) && typeof output.format === 'string' && result.format === undefined) {
    result.format = output.format;
  }
  if (typeof result.pattern === 'string' && UNICODE_PROPERTY.test(result.pattern)) {
    delete result.pattern;
    result.description ??= 'Caractères contrôlés par le serveur selon le contrat @oz/contracts.';
  }
  return result;
}

/** Schéma OpenAPI 3.0 d'un corps de requête, généré depuis un contrat : la doc ne peut pas diverger. */
export function openApiBodySchema(schema: z.ZodType): OpenApiSchema {
  const input = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });
  const output = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' });
  return merge(input, output) as OpenApiSchema;
}
