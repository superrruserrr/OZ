import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erasureInventory } from './registry.js';

// L'inventaire publié dans `docs/security/account-deletion.md` est celui du registre, sans écart.

const MARKDOWN = readFileSync(
  new URL('../../../../docs/security/account-deletion.md', import.meta.url),
  'utf8',
);

const cells = (cell: string): string[] =>
  cell === '—' ? [] : cell.split(',').map((c) => c.trim().replaceAll('`', ''));

function inventory(markdown: string): ReturnType<typeof erasureInventory> {
  const start = markdown.indexOf('<!-- erasure:inventory -->');
  const end = markdown.indexOf('<!-- /erasure:inventory -->');
  if (start < 0 || end < start) throw new Error('inventaire introuvable');
  const rows = markdown
    .slice(start, end)
    .split('\n')
    .filter((line) => /^\| `[a-z_]+` /.test(line));
  return Object.fromEntries(
    rows.map((line) => {
      const [, table = '', erase = '', aggregate = '', proof = ''] = line
        .split('|')
        .map((cell) => cell.trim());
      return [
        table.replaceAll('`', ''),
        { erase: cells(erase), aggregate: cells(aggregate), proof: cells(proof) },
      ];
    }),
  );
}

describe('inventaire publié', () => {
  it('chaque table et chaque colonne non technique du registre, rien de plus', () => {
    expect(inventory(MARKDOWN)).toEqual(erasureInventory());
  });
});
