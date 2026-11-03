import { EventEmitter } from 'node:events';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import * as oz from '@oz/db';
import {
  createMaintenanceHandlers,
  createMaintenanceProcessor,
  MAINTENANCE_JOBS,
  observeMaintenance,
  scheduleMaintenance,
  type SchedulerQueue,
} from './maintenance.js';

// Maintenance du coffre (lot 1.9cb, tâche 6) : câblage, aiguillage, job hors contrat, planification.

vi.mock('@oz/db', () => ({
  listDuePurges: vi.fn(() =>
    Promise.resolve([{ id: '0b3c5f6e-1a2b-4c3d-8e4f-5a6b7c8d9e01', type: 'photo' }]),
  ),
  finishDocumentPurge: vi.fn(() => Promise.resolve('done')),
  listStalePending: vi.fn(() =>
    Promise.resolve([{ id: '0b3c5f6e-1a2b-4c3d-8e4f-5a6b7c8d9e02', action: 'fail' }]),
  ),
  finishDocumentScan: vi.fn(() => Promise.resolve()),
  findStorageOrphans: vi.fn((_db: unknown, keys: readonly string[]) => Promise.resolve([...keys])),
}));

const logger = () => {
  const logs: { level: string; event: string; fields: Record<string, unknown> }[] = [];
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  return { logs, logger: { info: log('info'), warn: log('warn'), error: log('error') } };
};

describe('createMaintenanceHandlers', () => {
  it('branche chaque traitement sur la base du worker et le stockage', async () => {
    const db = {} as never;
    const old = new Date(Date.now() - 7_200_000);
    const storage = {
      list: vi.fn((prefix: string) =>
        Promise.resolve({
          objects: prefix === 'clean/' ? [{ key: 'clean/orphelin', lastModified: old }] : [],
          next: undefined,
        }),
      ),
      remove: vi.fn(() => Promise.resolve()),
    };
    const handlers = createMaintenanceHandlers({
      db,
      storage,
      scanQueue: { getJob: vi.fn(), add: vi.fn() },
      logger: logger().logger,
    });

    await handlers['purge-due']();
    expect(oz.listDuePurges).toHaveBeenCalledWith(db, 100);
    expect(oz.finishDocumentPurge).toHaveBeenCalledWith(db, '0b3c5f6e-1a2b-4c3d-8e4f-5a6b7c8d9e01');

    await handlers['sweep-pending']();
    expect(oz.listStalePending).toHaveBeenCalledWith(db, 100);
    expect(oz.finishDocumentScan).toHaveBeenCalledWith(db, '0b3c5f6e-1a2b-4c3d-8e4f-5a6b7c8d9e02', {
      verdict: 'error',
    });

    await handlers['purge-orphans']();
    expect(oz.findStorageOrphans).toHaveBeenCalledWith(db, ['clean/orphelin']);
    expect(storage.remove).toHaveBeenCalledWith('clean/orphelin');
  });
});

describe('createMaintenanceProcessor', () => {
  it('aiguille chaque job vers son traitement et rend son résultat', async () => {
    const handlers = {
      'purge-due': vi.fn(() => Promise.resolve('purge')),
      'sweep-pending': vi.fn(() => Promise.resolve('balayage')),
      'purge-orphans': vi.fn(() => Promise.resolve('orphelins')),
    };
    const process = createMaintenanceProcessor(handlers, logger().logger);
    expect(await process({ name: 'purge-due', data: {} })).toBe('purge');
    expect(await process({ name: 'sweep-pending', data: {} })).toBe('balayage');
    expect(await process({ name: 'purge-orphans', data: {} })).toBe('orphelins');
    expect(handlers['purge-due']).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['nom inconnu', { name: 'scan-document', data: {} }],
    ['données', { name: 'purge-due', data: { documentId: 'x' } }],
    ['données nulles', { name: 'purge-due', data: null }],
    ['données non objet', { name: 'purge-due', data: 'x' }],
  ])(
    'job hors contrat (%s) : abandonné sans nouvel essai, rien journalisé du contenu',
    async (_l, job) => {
      const { logs, logger: log } = logger();
      const handler = vi.fn(() => Promise.resolve());
      const process = createMaintenanceProcessor(
        { 'purge-due': handler, 'sweep-pending': handler, 'purge-orphans': handler },
        log,
      );
      await expect(process(job)).rejects.toBeInstanceOf(UnrecoverableError);
      expect(handler).not.toHaveBeenCalled();
      expect(logs).toEqual([
        { level: 'error', event: 'document.maintenance.invalid_job', fields: {} },
      ]);
    },
  );
});

describe('scheduleMaintenance', () => {
  const queue = () => {
    const calls: unknown[][] = [];
    const q: SchedulerQueue = {
      upsertJobScheduler: (...args) => {
        calls.push(['upsert', ...args]);
        return Promise.resolve();
      },
      removeJobScheduler: (id) => {
        calls.push(['remove', id]);
        return Promise.resolve();
      },
    };
    return { calls, q };
  };

  it('trois planifications à identifiant fixe, cadences en millisecondes, sans données', async () => {
    const { calls, q } = queue();
    await scheduleMaintenance(q, { enabled: true, purgeEveryMinutes: 15, orphansEveryMinutes: 60 });
    const opts = { attempts: 1, removeOnComplete: 100, removeOnFail: 100 };
    expect(calls).toEqual([
      ['upsert', 'purge-due', { every: 900_000 }, { name: 'purge-due', data: {}, opts }],
      ['upsert', 'sweep-pending', { every: 900_000 }, { name: 'sweep-pending', data: {}, opts }],
      ['upsert', 'purge-orphans', { every: 3_600_000 }, { name: 'purge-orphans', data: {}, opts }],
    ]);
  });

  it('désactivée : les planifications sont retirées', async () => {
    const { calls, q } = queue();
    await scheduleMaintenance(q, {
      enabled: false,
      purgeEveryMinutes: 15,
      orphansEveryMinutes: 60,
    });
    expect(calls).toEqual(MAINTENANCE_JOBS.map((name) => ['remove', name]));
  });
});

describe('observeMaintenance', () => {
  it('échec et erreur : nom du job et type d’erreur seuls', () => {
    const events = new EventEmitter();
    const { logs, logger: log } = logger();
    observeMaintenance(events, log);
    events.emit(
      'failed',
      { id: '1', name: 'purge-due', attemptsMade: 1 },
      new TypeError('clean/x'),
    );
    events.emit('failed', undefined, new Error('y'));
    events.emit('failed', { name: '<script>', attemptsMade: 1 }, new Error('z'));
    events.emit('error', new RangeError('redis://u:p@h'));
    expect(logs).toEqual([
      {
        level: 'warn',
        event: 'document.maintenance.failed',
        fields: { job: 'purge-due', cause: 'TypeError' },
      },
      {
        level: 'warn',
        event: 'document.maintenance.failed',
        fields: { job: undefined, cause: 'Error' },
      },
      {
        level: 'warn',
        event: 'document.maintenance.failed',
        fields: { job: undefined, cause: 'Error' },
      },
      { level: 'error', event: 'document.maintenance.error', fields: { cause: 'RangeError' } },
    ]);
  });
});
