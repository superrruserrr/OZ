import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERASURE_REGISTRY } from './registry.js';

// Registre des traitements (lot 1.16cbb, EX-118 n° 4) : chaque table du registre d'effacement, qui
// couvre toute la base, est rattachée à au moins un traitement décrit, et rien de plus.

const MARKDOWN = readFileSync(
  new URL('../../../../docs/security/gdpr-register.md', import.meta.url),
  'utf8',
);

function tables(markdown: string): Record<string, string[]> {
  const start = markdown.indexOf('<!-- gdpr:tables -->');
  const end = markdown.indexOf('<!-- /gdpr:tables -->');
  if (start < 0 || end < start) throw new Error('liste des tables introuvable');
  return Object.fromEntries(
    markdown
      .slice(start, end)
      .split('\n')
      .filter((line) => /^\| `[a-z_]+` /.test(line))
      .map((line) => {
        const [, table = '', activities = ''] = line.split('|').map((cell) => cell.trim());
        return [table.replaceAll('`', ''), activities.split(',').map((a) => a.trim())];
      }),
  );
}

const described = new Set(
  [...MARKDOWN.matchAll(/^### (T\d+) — /gm)].map((match) => match[1] ?? ''),
);

describe('registre des traitements', () => {
  it('chaque table de la base, rien de plus', () => {
    expect(Object.keys(tables(MARKDOWN)).sort()).toEqual(Object.keys(ERASURE_REGISTRY).sort());
  });

  it('chaque table rattachée à au moins un traitement décrit', () => {
    expect(described.size).toBeGreaterThanOrEqual(8);
    for (const [table, activities] of Object.entries(tables(MARKDOWN))) {
      expect(activities.length, table).toBeGreaterThan(0);
      for (const activity of activities)
        expect(described, `${table} → ${activity}`).toContain(activity);
    }
  });

  it('chaque traitement décrit sert au moins une table', () => {
    const used = new Set(Object.values(tables(MARKDOWN)).flat());
    expect([...described].filter((activity) => !used.has(activity))).toEqual([]);
  });
});
