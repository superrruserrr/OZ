// Conventions de packages/contracts (EX-005 n° 1) : vérifiées sur des cas fabriqués puis sur l'arbre réel.
import { describe, expect, it } from 'vitest';
import { checkContracts, readContractFiles } from './check-contracts.mjs';

const good = {
  path: 'contact/send-contact-message.schema.ts',
  content:
    "import { z } from 'zod';\nexport const sendContactMessageSchema = z.strictObject({});\nexport type SendContactMessageInput = z.infer<typeof sendContactMessageSchema>;\n",
};

describe('checkContracts', () => {
  it('accepte un schéma conforme', () => {
    expect(checkContracts([good])).toEqual([]);
  });

  it('accepte une liste de valeurs constante en MAJUSCULES à côté du schéma', () => {
    const content = `export const ORGANISATION_TYPES = ['club'] as const;\n${good.content}`;
    expect(checkContracts([{ ...good, content }])).toEqual([]);
  });

  it.each([
    [
      'export camelCase qui n’est pas un schéma',
      { ...good, content: `export const helper = 1;\n${good.content}` },
    ],
    [
      'export de fonction dans un schéma',
      { ...good, content: `export function make() {}\n${good.content}` },
    ],
    ['export let dans un schéma', { ...good, content: `export let mutable = 1;\n${good.content}` }],
    [
      'export interface dans un schéma',
      { ...good, content: `export interface Shape { a: string }\n${good.content}` },
    ],
    ['fichier non TypeScript', { ...good, path: 'contact/send-contact-message.schema.js' }],
    ['fichier hors dossier de ressource', { ...good, path: 'send-contact-message.schema.ts' }],
    ['nom de fichier non kebab-case', { ...good, path: 'contact/SendContact.schema.ts' }],
    ['fichier non suffixé .schema.ts', { ...good, path: 'contact/contact.ts' }],
    [
      'schéma exporté sans suffixe Schema',
      {
        ...good,
        content: good.content.replace('sendContactMessageSchema = ', 'sendContactMessage = '),
      },
    ],
    [
      'type inféré sans suffixe Input',
      { ...good, content: good.content.replace('SendContactMessageInput', 'SendContactMessage') },
    ],
  ])('refuse : %s', (_, file) => {
    expect(checkContracts([file]).length).toBeGreaterThan(0);
  });
});

describe('packages/contracts (arbre réel)', () => {
  it('contient au moins un contrat et respecte toutes les conventions', () => {
    const files = readContractFiles();
    expect(files.some((file) => file.path.endsWith('.schema.ts'))).toBe(true);
    expect(checkContracts(files)).toEqual([]);
  });
});
