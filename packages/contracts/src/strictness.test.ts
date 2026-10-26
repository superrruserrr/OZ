// D2 / CP-06 : tout objet de tout schéma exporté est strict, quelle que soit la façon de l'écrire.
// Vérifié sur les objets Zod eux-mêmes (un contrôle textuel se contourne : z.looseObject, .strip(),
// .catchall(), alias, import nommé…).
import { z } from 'zod';
import * as zm from 'zod/mini';
import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';
import { exportViolations, isZodSchema, nonStrictObjects } from './strictness.js';

describe('nonStrictObjects', () => {
  it('accepte un objet strict, y compris imbriqué, optionnel, en tableau ou en union', () => {
    const inner = z.strictObject({ a: z.string() });
    const schema = z.strictObject({
      nested: inner,
      maybe: inner.optional(),
      list: z.array(inner),
      either: z.union([inner, z.string()]),
      piped: z.string().pipe(z.email()),
    });
    expect(nonStrictObjects(schema)).toEqual([]);
  });

  it('ne confond pas une vérification (.refine, .min) avec un type ouvert', () => {
    const schema = z.strictObject({
      code: z
        .string()
        .min(2)
        .refine((value) => value !== 'x'),
    });
    expect(nonStrictObjects(schema)).toEqual([]);
  });

  it.each([
    ['z.object', z.object({ a: z.string() })],
    ['z.looseObject', z.looseObject({ a: z.string() })],
    ['.strip()', z.strictObject({ a: z.string() }).strip()],
    ['.catchall()', z.strictObject({ a: z.string() }).catchall(z.unknown())],
    ['objet relâché imbriqué', z.strictObject({ inner: z.object({ a: z.string() }) })],
    ['dans un tableau', z.strictObject({ list: z.array(z.object({ a: z.string() })) })],
    ['dans une union', z.strictObject({ u: z.union([z.object({ a: z.string() }), z.string()]) })],
    [
      'derrière optional/nullable',
      z.strictObject({ o: z.object({ a: z.string() }).optional().nullable() }),
    ],
    [
      'derrière un pipe',
      z
        .string()
        .transform(() => ({}))
        .pipe(z.object({})),
    ],
    ['objet zod/mini imbriqué', z.strictObject({ inner: zm.object({ a: zm.string() }) })],
    ['objet zod/mini seul', zm.object({ a: zm.string() })],
    ['z.record (clés arbitraires)', z.strictObject({ r: z.record(z.string(), z.string()) })],
    ['z.unknown', z.strictObject({ u: z.unknown() })],
    ['z.any', z.strictObject({ a: z.any() })],
    ['z.custom', z.strictObject({ c: z.custom<object>(() => true) })],
    ['z.json', z.strictObject({ j: z.json() })],
  ])('signale un objet non strict : %s', (_, schema: unknown) => {
    expect(nonStrictObjects(schema).length).toBeGreaterThan(0);
  });
});

describe('@oz/contracts (exports réels)', () => {
  // Reconnaissance par la structure interne : couvre zod classique et zod/mini.
  const schemas = Object.entries(contracts).filter(([, value]) => isZodSchema(value));

  it('exporte au moins un schéma', () => {
    expect(schemas.length).toBeGreaterThan(0);
  });

  it.each(schemas)('%s : aucun objet non strict', (_, schema) => {
    expect(nonStrictObjects(schema)).toEqual([]);
  });
});

describe('exportViolations : aucun schéma caché derrière une fonction ou un objet (revue tour 3)', () => {
  const factories = { longText: [20, 2_000] as const };

  it('accepte schémas, listes de valeurs, constantes texte et fabriques autorisées', () => {
    const module = {
      aSchema: z.strictObject({}),
      VALUES: ['a', 'b'],
      PACKAGE_NAME: '@oz/x',
      longText: (min: number, max: number) => z.string().min(min).max(max),
    };
    expect(exportViolations(module, factories)).toEqual([]);
  });

  it.each([
    ['fabrique non autorisée', { makeSchema: () => z.object({}) }],
    ['objet contenant un schéma', { xSchema: { inner: z.object({}) } }],
    ['tableau qui n’est pas une liste de textes', { LIST: [z.object({})] }],
    ['fabrique autorisée qui produit un objet relâché', { longText: () => z.object({}) }],
  ])('refuse : %s', (_, module) => {
    expect(exportViolations(module, factories).length).toBeGreaterThan(0);
  });

  it('valide tous les exports réels de @oz/contracts', () => {
    expect(exportViolations(contracts, factories)).toEqual([]);
  });
});
