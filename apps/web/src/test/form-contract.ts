import type { z } from 'zod';

/**
 * Test de contrat obligatoire pour tout formulaire (EX-T04 n° 4, packages/contracts/README.md) :
 * les champs nommés du formulaire doivent être exactement les clés du schéma, dans les deux sens.
 *
 * Limites connues (à étendre au premier besoin) : seuls les contrôles portant un attribut `name` sont
 * vus (React Hook Form en pose un via `register`) ; seules les clés de premier niveau sont comparées
 * (un formulaire imbriqué `address.city` devra comparer le chemin complet).
 */
export function expectFormMatchesSchema(
  form: HTMLFormElement,
  schema: z.ZodObject<z.ZodRawShape>,
): void {
  const formFields = new Set(
    [...form.elements]
      .map((element) => element.getAttribute('name'))
      .filter((name): name is string => name !== null && name !== ''),
  );
  const schemaFields = new Set(Object.keys(schema.shape));

  const missingInForm = [...schemaFields].filter((name) => !formFields.has(name)).sort();
  const unknownToSchema = [...formFields].filter((name) => !schemaFields.has(name)).sort();
  const problems = [
    ...(missingInForm.length > 0 ? [`absents du formulaire : ${missingInForm.join(', ')}`] : []),
    ...(unknownToSchema.length > 0 ? [`absents du schéma : ${unknownToSchema.join(', ')}`] : []),
  ];
  if (problems.length > 0) {
    throw new Error(`Formulaire et schéma divergent — ${problems.join(' ; ')}`);
  }
}
