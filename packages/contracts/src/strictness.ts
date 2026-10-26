interface Definition {
  readonly type: string;
  readonly catchall?: unknown;
  readonly getter?: () => unknown;
  readonly [key: string]: unknown;
}

interface ZodSchemaLike {
  readonly _zod: { readonly def: Definition };
}

/**
 * Schéma Zod 4, classique ou `zod/mini`, reconnu par sa structure interne (`_zod.def`).
 * `instanceof z.ZodType` ne reconnaît pas les schémas `zod/mini`.
 */
export function isZodSchema(value: unknown): value is ZodSchemaLike {
  if (value === null || typeof value !== 'object' || !('_zod' in value)) return false;
  const internals = value._zod;
  if (internals === null || typeof internals !== 'object' || !('def' in internals)) return false;
  const def = internals.def;
  return (
    def !== null && typeof def === 'object' && typeof (def as { type?: unknown }).type === 'string'
  );
}

// Types qui acceptent des clés ou des valeurs arbitraires : même exposition qu'un objet non strict.
const OPEN_TYPES = new Set(['record', 'unknown', 'any', 'custom']);

/**
 * Chemins des parties non strictes d'un schéma (D2, CP-06) : objet dont les clés inconnues ne sont
 * pas refusées (catchall autre que `never`), type ouvert (record, unknown, any, custom), ou schéma
 * non reconnu (Zod 3). Le parcours est générique : tout sous-schéma présent dans la définition est
 * visité (imbrications, tableaux, unions, intersections, pipes, optionnels, schémas paresseux…).
 */
export function nonStrictObjects(
  schema: unknown,
  path = '(racine)',
  seen = new WeakSet<object>(),
): string[] {
  if (!isZodSchema(schema)) return [`${path} : schéma non reconnu (Zod 4 attendu)`];
  if (seen.has(schema)) return [];
  seen.add(schema);
  const def = schema._zod.def;
  const found: string[] = [];

  if (def.type === 'object') {
    const catchall = def.catchall;
    if (!isZodSchema(catchall) || catchall._zod.def.type !== 'never')
      found.push(`${path} : objet non strict`);
  }
  if (OPEN_TYPES.has(def.type)) found.push(`${path} : type ouvert « ${def.type} »`);
  if (def.type === 'lazy' && def.getter) found.push(...nonStrictObjects(def.getter(), path, seen));

  const visit = (value: unknown, childPath: string): void => {
    if (isZodSchema(value)) {
      found.push(...nonStrictObjects(value, childPath, seen));
    } else if (value !== null && typeof value === 'object' && '_def' in value) {
      found.push(`${childPath} : schéma Zod 3 interdit`);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, `${childPath}[${String(index)}]`);
      });
    }
  };
  for (const [key, value] of Object.entries(def)) {
    // `checks` : vérifications (.min(), .refine()…) ; en Zod 4 un .refine() est un schéma `custom`,
    // mais il ne définit aucun champ d'entrée. Un z.custom() utilisé comme type de champ est, lui, visité.
    if (key === 'catchall' || key === 'getter' || key === 'checks') continue;
    if (key === 'shape' && value !== null && typeof value === 'object') {
      for (const [field, child] of Object.entries(value)) visit(child, `${path}.${field}`);
    } else {
      visit(value, path);
    }
  }
  return found;
}

/**
 * Exports d'un module de contrats qui pourraient cacher un schéma non vérifié (revue tour 3).
 * Admis : un schéma Zod (vérifié par nonStrictObjects), une liste de textes, un texte, ou une
 * fabrique explicitement autorisée — appelée avec des arguments d'exemple, son résultat est vérifié.
 */
export function exportViolations(
  module: Readonly<Record<string, unknown>>,
  factories: Readonly<Record<string, readonly unknown[]>>,
): string[] {
  const violations: string[] = [];
  for (const [name, value] of Object.entries(module)) {
    if (isZodSchema(value)) {
      violations.push(...nonStrictObjects(value, name));
    } else if (typeof value === 'string') {
      continue;
    } else if (Array.isArray(value)) {
      if (!value.every((item) => typeof item === 'string')) {
        violations.push(`${name} : tableau exporté qui n’est pas une liste de textes`);
      }
    } else if (typeof value === 'function') {
      const args = factories[name];
      if (!args) {
        violations.push(`${name} : fonction exportée non autorisée (pourrait fabriquer un schéma)`);
        continue;
      }
      const produced: unknown = (value as (...input: readonly unknown[]) => unknown)(...args);
      violations.push(...nonStrictObjects(produced, `${name}(…)`));
    } else {
      violations.push(`${name} : export d’un type non admis (${typeof value})`);
    }
  }
  return violations;
}
