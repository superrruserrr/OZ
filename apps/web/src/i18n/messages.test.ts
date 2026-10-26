// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import { routing } from './routing';

/** Clés feuilles `a.b.c` d'un dictionnaire, avec leur valeur. */
function leaves(tree: object, prefix = ''): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]): [string, unknown][] =>
    value !== null && typeof value === 'object'
      ? leaves(value as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  );
}

describe('i18n web (EX-T21.3)', () => {
  it('français par défaut, anglais préparé, sans préfixe pour le français', () => {
    expect(routing.locales).toEqual(['fr', 'en']);
    expect(routing.defaultLocale).toBe('fr');
    expect(routing.localePrefix).toBe('as-needed');
    // Pas de redirection selon la langue du navigateur, pas de cookie de langue.
    expect(routing.localeDetection).toBe(false);
    expect(routing.localeCookie).toBe(false);
  });

  it('les dictionnaires fr et en ont exactement les mêmes clés', () => {
    expect(leaves(en).map(([key]) => key)).toEqual(leaves(fr).map(([key]) => key));
    expect(leaves(fr).length).toBeGreaterThan(0);
  });

  it.each([
    ['fr', fr],
    ['en', en],
  ])('aucune valeur vide ni non textuelle (%s)', (_, messages) => {
    for (const [key, value] of leaves(messages)) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim(), key).not.toBe('');
    }
  });

  it('les clés suivent dot.camelCase par écran (naming_conventions.md)', () => {
    for (const [key] of leaves(fr))
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
  });
});
