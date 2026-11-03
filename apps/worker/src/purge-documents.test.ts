import type { DuePurge } from '@oz/db';
import { StorageError } from '@oz/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { purgeDueDocuments, type PurgeDependencies } from './purge-documents.js';

// Purge des pièces échues (lot 1.9cb, tâche 3) avec des doublures : ordre, erreurs isolées, journaux.

const A = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const B = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708193';
const C = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708194';

let calls: string[];
let logs: { level: string; event: string; fields: Record<string, unknown> }[];
let due: DuePurge[];
let failRemove: Set<string>;
let finishOutcome: Map<string, 'done' | 'skipped'>;
let deps: PurgeDependencies;

beforeEach(() => {
  calls = [];
  logs = [];
  due = [
    { id: A, type: 'identity_document' },
    { id: B, type: 'photo' },
    { id: C, type: 'birth_certificate' },
  ];
  failRemove = new Set();
  finishOutcome = new Map();
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  deps = {
    listDue: (limit) => {
      calls.push(`list:${String(limit)}`);
      return Promise.resolve(due);
    },
    finish: (id) => {
      calls.push(`finish:${id}`);
      return Promise.resolve(finishOutcome.get(id) ?? 'done');
    },
    storage: {
      remove: (key) => {
        calls.push(`remove:${key}`);
        return failRemove.has(key)
          ? Promise.reject(new StorageError(`stockage indisponible : ${key}`))
          : Promise.resolve();
      },
    },
    logger: { info: log('info'), warn: log('warn'), error: log('error') },
  };
});

describe('purgeDueDocuments', () => {
  it('supprime `clean/` et `quarantine/` puis marque la pièce, dans cet ordre', async () => {
    due = [{ id: A, type: 'identity_document' }];
    expect(await purgeDueDocuments(deps, 100)).toEqual({ purged: 1, skipped: 0, failed: 0 });
    expect(calls).toEqual([
      'list:100',
      `remove:clean/${A}`,
      `remove:quarantine/${A}`,
      `finish:${A}`,
    ]);
    expect(logs).toContainEqual({
      level: 'info',
      event: 'document.purge.purged',
      fields: { documentId: A, documentType: 'identity_document' },
    });
  });

  it('suppression en échec : pièce non marquée, les suivantes traitées ; `skipped` compté', async () => {
    failRemove.add(`quarantine/${A}`);
    finishOutcome.set(B, 'skipped');
    expect(await purgeDueDocuments(deps, 3)).toEqual({ purged: 1, skipped: 1, failed: 1 });
    expect(calls).not.toContain(`finish:${A}`);
    expect(calls).toContain(`finish:${C}`);
    expect(logs).toContainEqual({
      level: 'warn',
      event: 'document.purge.failed',
      fields: { documentId: A, cause: 'StorageError' },
    });
    expect(logs).toContainEqual({
      level: 'info',
      event: 'document.purge.done',
      fields: { purged: 1, skipped: 1, failed: 1 },
    });
  });

  it('journaux sans clé de stockage ni message d’erreur ; valeur non Error décrite « inconnue »', async () => {
    due = [{ id: A, type: 'photo' }];
    deps.finish = () => Promise.reject(new Error(`clé clean/${A} secrète`));
    await purgeDueDocuments(deps, 1);
    const notAnError: unknown = 'chaîne';
    deps.finish = async () => {
      await Promise.resolve();
      throw notAnError;
    };
    await purgeDueDocuments(deps, 1);
    const text = JSON.stringify(logs);
    expect(text).not.toContain('clean/');
    expect(text).not.toContain('secrète');
    expect(
      logs.filter((l) => l.event === 'document.purge.failed').map((l) => l.fields.cause),
    ).toEqual(['Error', 'inconnue']);
  });

  it('rien d’échu : aucun appel au stockage', async () => {
    due = [];
    expect(await purgeDueDocuments(deps, 100)).toEqual({ purged: 0, skipped: 0, failed: 0 });
    expect(calls).toEqual(['list:100']);
  });
});
