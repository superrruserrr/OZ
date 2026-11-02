import type { ScanVerdict } from '@oz/db';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  DOCUMENT_SCAN_JOB,
  DOCUMENT_SCAN_QUEUE,
  createScanProcessor,
  type ScanJob,
} from './processor.js';
import type { ScanDependencies } from './scan-document.js';

// Consommateur de la file `document-scan` (lot 1.9b, tâche 6) : contrat du message, dernier essai.

const ID = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';

function setup() {
  const logs: { level: string; event: string; fields: Record<string, unknown> }[] = [];
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  const finish = vi.fn((_id: string, _verdict: ScanVerdict) => Promise.resolve('done' as const));
  const claim = vi.fn((_id: string) => Promise.resolve(null));
  const deps: ScanDependencies = {
    claim,
    finish,
    storage: { read: vi.fn(), put: vi.fn(), remove: vi.fn() },
    clamav: { scan: vi.fn() },
    logger: { info: log('info'), warn: log('warn'), error: log('error') },
  };
  return { deps, logs, finish, claim };
}

const job = (overrides: Partial<ScanJob> = {}): ScanJob => ({
  name: DOCUMENT_SCAN_JOB,
  data: { documentId: ID },
  attemptsMade: 0,
  opts: { attempts: 5 },
  ...overrides,
});

describe('createScanProcessor', () => {
  it('même file et même nom de job que le producteur de l’API', () => {
    expect(DOCUMENT_SCAN_QUEUE).toBe('document-scan');
    expect(DOCUMENT_SCAN_JOB).toBe('scan-document');
  });

  it('analyse le document du message et journalise le résultat', async () => {
    const { deps, logs, claim } = setup();
    expect(await createScanProcessor(deps)(job())).toBe('skipped');
    expect(claim).toHaveBeenCalledWith(ID);
    expect(logs).toContainEqual({
      level: 'info',
      event: 'document.scan.done',
      fields: { documentId: ID, outcome: 'skipped' },
    });
  });

  it.each([
    ['champ en trop', { name: DOCUMENT_SCAN_JOB, data: { documentId: ID, key: 'clean/x' } }],
    ['identifiant invalide', { name: DOCUMENT_SCAN_JOB, data: { documentId: 'x' } }],
    ['message absent', { name: DOCUMENT_SCAN_JOB, data: null }],
    ['autre nom de job', { name: 'autre', data: { documentId: ID } }],
  ])('message invalide (%s) : abandon sans nouvel essai, rien lu', async (_label, override) => {
    const { deps, logs, claim } = setup();
    await expect(createScanProcessor(deps)(job(override))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(claim).not.toHaveBeenCalled();
    expect(logs).toEqual([{ level: 'error', event: 'document.scan.invalid_job', fields: {} }]);
  });

  it.each([
    [0, 5, false],
    [3, 5, false],
    [4, 5, true],
    [0, undefined, true],
  ])(
    'essais déjà faits %i sur %s : dernier essai = %s',
    async (attemptsMade, attempts, lastAttempt) => {
      const { deps, finish } = setup();
      deps.claim = vi.fn(() => Promise.reject(new Error('base indisponible')));
      await expect(
        createScanProcessor(deps)(job({ attemptsMade, opts: { attempts } })),
      ).rejects.toThrow(/base/);
      // Au dernier essai seulement, le verdict `error` est écrit (document jamais accessible).
      expect(finish.mock.calls.length > 0).toBe(lastAttempt);
    },
  );
});
