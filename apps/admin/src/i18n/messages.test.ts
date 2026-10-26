// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import { ADMIN_LOCALE } from './request';

function leaves(tree: object, prefix = ''): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]): [string, unknown][] =>
    value !== null && typeof value === 'object'
      ? leaves(value as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  );
}

describe('i18n admin (EX-T21.3)', () => {
  it('le back-office est en français ; l’anglais est préparé', () => {
    expect(ADMIN_LOCALE).toBe('fr');
  });

  it('fr et en ont les mêmes clés, toutes renseignées', () => {
    expect(leaves(en).map(([key]) => key)).toEqual(leaves(fr).map(([key]) => key));
    for (const [key, value] of [...leaves(fr), ...leaves(en)]) {
      expect(typeof value === 'string' && value.trim() !== '', key).toBe(true);
    }
  });
});
