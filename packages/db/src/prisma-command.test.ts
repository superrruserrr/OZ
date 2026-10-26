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
