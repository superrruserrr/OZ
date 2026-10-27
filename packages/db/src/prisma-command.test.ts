import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commandNeedsDatabase } from './prisma-command.js';

describe('commandNeedsDatabase (piège : la CLI Prisma 7 sort en succès sans base)', () => {
  it.each([
    ['migrate', 'deploy'],
    ['migrate', 'status'],
    ['migrate', 'diff'],
    ['migrate', 'dev'],
    ['db', 'push'],
    ['studio'],
  ])('prisma %s %s exige DATABASE_URL', (...command) => {
    expect(commandNeedsDatabase(['node', 'prisma', ...command])).toBe(true);
  });

  it.each([['generate'], ['validate'], ['format'], ['--version']])(
    'prisma %s s’en passe',
    (command) => {
      expect(commandNeedsDatabase(['node', 'prisma', command])).toBe(false);
    },
  );
});

describe('prisma.config.ts', () => {
  // `prisma generate` s'exécute avant la compilation des paquets du monorepo (CI vierge) : la
  // configuration et ses imports locaux ne doivent dépendre d'aucun `@oz/*`.
  it('ne charge aucun paquet du monorepo, même indirectement', () => {
    const seen = new Set<string>();
    const workspaceImports: string[] = [];
    const visit = (url: URL): void => {
      if (seen.has(url.href)) return;
      seen.add(url.href);
      const source = readFileSync(url, 'utf8');
      for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) {
        if (!specifier) continue;
        if (specifier.startsWith('@oz/')) workspaceImports.push(`${url.pathname}: ${specifier}`);
        if (specifier.startsWith('.')) visit(new URL(specifier.replace(/\.js$/, '.ts'), url));
      }
    };
    visit(new URL('../prisma.config.ts', import.meta.url));
    expect(seen.size).toBeGreaterThan(2);
    expect(workspaceImports).toEqual([]);
  });
});
