import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportedFields } from './registry.js';

// L'inventaire publié dans `docs/security/data-export.md` est celui du registre, sans écart.

const MARKDOWN = readFileSync(
  new URL('../../../../docs/security/data-export.md', import.meta.url),
  'utf8',
);

function inventory(markdown: string): Record<string, string[]> {
  const start = markdown.indexOf('<!-- export:inventory -->');
  const end = markdown.indexOf('<!-- /export:inventory -->');
  if (start < 0 || end < start) throw new Error('inventaire introuvable');
  const rows = markdown
    .slice(start, end)
    .split('\n')
    .filter((line) => /^\| `[a-zA-Z]+` /.test(line));
  return Object.fromEntries(
    rows.map((line) => {
      const [, section = '', fields = ''] = line.split('|').map((cell) => cell.trim());
      return [
        section.replaceAll('`', ''),
        fields.split(',').map((f) => f.trim().replaceAll('`', '')),
      ];
    }),
  );
}

describe('inventaire publié', () => {
  it('chaque section et chaque champ du registre, rien de plus', () => {
    expect(inventory(MARKDOWN)).toEqual(exportedFields());
  });
});
