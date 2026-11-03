import type { ListedPage, StoragePrefix } from '@oz/storage';
import { StorageError } from '@oz/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOrphanPurger, ORPHAN_MIN_AGE_MS, type OrphanDependencies } from './purge-orphans.js';

// Objets orphelins (lot 1.9cb, tâche 4) avec des doublures : seules les clés désignées par la base
// sont supprimées, par paquets de 500, avec un curseur par préfixe et des journaux sans clé.

const NOW = new Date('2026-11-06T12:00:00Z');
const key = (prefix: StoragePrefix, n: number): string =>
  `${prefix}0193b0a2-7c1e-7d2a-9b3c-${n.toString(16).padStart(12, '0')}`;

let pages: Map<StoragePrefix, ListedPage[]>;
let listCalls: {
  prefix: StoragePrefix;
  olderThan: Date;
  limit: number;
  startAfter?: string | undefined;
}[];
let submitted: string[][];
let orphans: Set<string>;
let removed: string[];
let failRemove: Set<string>;
let logs: { level: string; event: string; fields: Record<string, unknown> }[];
let deps: OrphanDependencies;

const page = (keys: string[], next?: string): ListedPage => ({
  objects: keys.map((k) => ({ key: k, lastModified: new Date('2026-11-01T00:00:00Z') })),
  next,
});

beforeEach(() => {
  pages = new Map();
  listCalls = [];
  submitted = [];
  orphans = new Set();
  removed = [];
  failRemove = new Set();
  logs = [];
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  deps = {
    findOrphans: (keys) => {
      submitted.push([...keys]);
      return Promise.resolve(keys.filter((k) => orphans.has(k)));
    },
    storage: {
      list: (prefix, options) => {
        listCalls.push({ prefix, ...options });
        return Promise.resolve(pages.get(prefix)?.shift() ?? page([]));
      },
      remove: (k) =>
        failRemove.has(k)
          ? Promise.reject(new StorageError('stockage indisponible'))
          : (removed.push(k), Promise.resolve()),
    },
    logger: { info: log('info'), warn: log('warn'), error: log('error') },
    now: () => NOW,
  };
});

describe('createOrphanPurger', () => {
  it('examine les trois préfixes, objets d’au moins une heure, et ne supprime que les orphelins', async () => {
    pages.set('incoming/', [page([key('incoming/', 1), key('incoming/', 2)])]);
    pages.set('clean/', [page([key('clean/', 3)])]);
    orphans.add(key('incoming/', 2));
    orphans.add(key('clean/', 3));
    const summary = await createOrphanPurger(deps)();
    expect(listCalls.map((c) => c.prefix)).toEqual(['incoming/', 'quarantine/', 'clean/']);
    expect(listCalls[0]).toEqual({
      prefix: 'incoming/',
      olderThan: new Date(NOW.getTime() - ORPHAN_MIN_AGE_MS),
      limit: 1000,
      startAfter: undefined,
    });
    expect(removed).toEqual([key('incoming/', 2), key('clean/', 3)]);
    expect(summary).toEqual({
      'incoming/': { examined: 2, removed: 1, failed: 0 },
      'quarantine/': { examined: 0, removed: 0, failed: 0 },
      'clean/': { examined: 1, removed: 1, failed: 0 },
    });
    // Préfixe vide : la base n'est pas interrogée.
    expect(submitted).toHaveLength(2);
  });

  it('soumet par paquets de 500 et reprend après le curseur à l’exécution suivante', async () => {
    const many = Array.from({ length: 1000 }, (_, n) => key('quarantine/', n));
    pages.set('quarantine/', [page(many, many.at(-1)), page([])]);
    const purge = createOrphanPurger(deps);
    await purge();
    expect(submitted.map((s) => s.length)).toEqual([500, 500]);
    await purge();
    const quarantineCalls = listCalls.filter((c) => c.prefix === 'quarantine/');
    expect(quarantineCalls.map((c) => c.startAfter)).toEqual([undefined, many.at(-1)]);
    // Fin du préfixe atteinte : on repart du début.
    await purge();
    expect(listCalls.filter((c) => c.prefix === 'quarantine/').at(-1)?.startAfter).toBeUndefined();
  });

  it('suppression en échec : comptée, journalisée sans clé, les autres continuent', async () => {
    pages.set('clean/', [page([key('clean/', 1), key('clean/', 2)])]);
    orphans.add(key('clean/', 1));
    orphans.add(key('clean/', 2));
    failRemove.add(key('clean/', 1));
    const summary = await createOrphanPurger(deps, 10)();
    expect(summary['clean/']).toEqual({ examined: 2, removed: 1, failed: 1 });
    expect(listCalls[0]?.limit).toBe(10);
    expect(logs).toContainEqual({
      level: 'warn',
      event: 'document.orphan.remove_failed',
      fields: { prefix: 'clean/', cause: 'StorageError' },
    });
    expect(JSON.stringify(logs)).not.toContain('0193b0a2');
  });

  it('valeur non Error décrite « inconnue » ; horloge par défaut', async () => {
    pages.set('incoming/', [page([key('incoming/', 1)])]);
    orphans.add(key('incoming/', 1));
    const notAnError: unknown = 'chaîne';
    deps.storage.remove = async () => {
      await Promise.resolve();
      throw notAnError;
    };
    delete deps.now;
    const before = Date.now();
    await createOrphanPurger(deps)();
    expect(listCalls[0]?.olderThan.getTime()).toBeGreaterThanOrEqual(before - ORPHAN_MIN_AGE_MS);
    expect(logs.find((l) => l.event === 'document.orphan.remove_failed')?.fields.cause).toBe(
      'inconnue',
    );
  });
});
