import { EventEmitter } from 'node:events';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import * as oz from '@oz/db';
import {
  AUDIT_JOBS,
  createAuditHandlers,
  createAuditProcessor,
  observeAuditMaintenance,
  scheduleAuditMaintenance,
  type AuditDependencies,
} from './audit-maintenance.js';
import type { SchedulerQueue } from './maintenance.js';

// Journal d'audit (lot 1.16a, tâche 3) : partitions (D-057), ancrage de la tête et vérification de
// la chaîne contre la dernière ancre (CP-23, D-060), alertes, aiguillage, planification.

vi.mock('@oz/db', () => ({
  maintainAuditPartitions: vi.fn(() =>
    Promise.resolve({ defaultRows: 0, failedMonths: 0, errorCode: null }),
  ),
  auditChainHead: vi.fn(() => Promise.resolve({ position: 9, hash: 'ab'.repeat(32) })),
  checkAuditChain: vi.fn(() =>
    Promise.resolve({
      checkedAt: new Date(),
      headPosition: 9,
      anchorPosition: 9,
      defectPosition: null,
    }),
  ),
}));

const HASH = 'ab'.repeat(32);

const logger = () => {
  const logs: { level: string; event: string; fields: Record<string, unknown> }[] = [];
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  return { logs, logger: { info: log('info'), warn: log('warn'), error: log('error') } };
};

const deps = (overrides: Partial<AuditDependencies> = {}) => {
  const { logs, logger: log } = logger();
  const anchors = {
    latest: vi.fn(() => Promise.resolve<{ position: number; hash: string } | null>(null)),
    put: vi.fn(() => Promise.resolve<'written' | 'exists'>('written')),
  };
  const head = vi.fn(() => Promise.resolve({ position: 9, hash: HASH }));
  const check = vi.fn((anchor: { position: number; hash: string } | null) =>
    Promise.resolve({
      checkedAt: new Date(),
      headPosition: 9,
      anchorPosition: anchor?.position ?? null,
      defectPosition: null as number | null,
    }),
  );
  const value: AuditDependencies = {
    maintainPartitions: vi.fn(() =>
      Promise.resolve({ defaultRows: 0, failedMonths: 0, errorCode: null }),
    ),
    head,
    check,
    anchors,
    logger: log,
    ...overrides,
  };
  return { deps: value, anchors, logs, head, check };
};

describe('maintain-partitions (D-057)', () => {
  it('rien d’anormal : journal d’information seul', async () => {
    const { deps: d, logs } = deps();
    await createAuditHandlers(d)['maintain-partitions']();
    expect(logs).toEqual([
      { level: 'info', event: 'audit.partition.done', fields: { defaultRows: 0, failedMonths: 0 } },
    ]);
  });

  it('entrées dans la partition par défaut ou mois manqué : alertes, comptes et code seuls', async () => {
    const { deps: d, logs } = deps({
      maintainPartitions: () =>
        Promise.resolve({ defaultRows: 3, failedMonths: 1, errorCode: '23514' }),
    });
    await createAuditHandlers(d)['maintain-partitions']();
    expect(logs.filter((l) => l.level === 'error')).toEqual([
      { level: 'error', event: 'audit.partition.default_used', fields: { defaultRows: 3 } },
      {
        level: 'error',
        event: 'audit.partition.failed',
        fields: { failedMonths: 1, code: '23514' },
      },
    ]);
  });
});

describe('anchor-head (D-060)', () => {
  it('tête en avance sur la dernière ancre : nouvelle ancre écrite', async () => {
    const { deps: d, anchors, logs } = deps();
    anchors.latest.mockResolvedValue({ position: 4, hash: HASH });
    await createAuditHandlers(d)['anchor-head']();
    expect(anchors.put).toHaveBeenCalledWith({ position: 9, hash: HASH });
    expect(logs).toContainEqual({
      level: 'info',
      event: 'audit.anchor.written',
      fields: { position: 9 },
    });
  });

  it('chaîne en défaut contre la dernière ancre : alerte, aucune ancre écrite', async () => {
    const { deps: d, anchors, logs, check } = deps();
    anchors.latest.mockResolvedValue({ position: 4, hash: HASH });
    check.mockResolvedValue({
      checkedAt: new Date(),
      headPosition: 9,
      anchorPosition: 4,
      defectPosition: 4,
    });
    expect(await createAuditHandlers(d)['anchor-head']()).toBe('refused');
    expect(check).toHaveBeenCalledWith({ position: 4, hash: HASH });
    expect(anchors.put).not.toHaveBeenCalled();
    expect(logs).toContainEqual({
      level: 'error',
      event: 'audit.anchor.refused',
      fields: { defectPosition: 4, headPosition: 9 },
    });
  });

  it('première ancre : chaîne vérifiée seule avant écriture', async () => {
    const { deps: d, anchors, check } = deps();
    await createAuditHandlers(d)['anchor-head']();
    expect(check).toHaveBeenCalledWith(null);
    expect(anchors.put).toHaveBeenCalledWith({ position: 9, hash: HASH });
  });

  it('tête inchangée ou chaîne vide : rien n’est écrit', async () => {
    const same = deps();
    same.anchors.latest.mockResolvedValue({ position: 9, hash: HASH });
    await createAuditHandlers(same.deps)['anchor-head']();
    expect(same.anchors.put).not.toHaveBeenCalled();

    const empty = deps({ head: () => Promise.resolve({ position: 0, hash: '00'.repeat(32) }) });
    await createAuditHandlers(empty.deps)['anchor-head']();
    expect(empty.anchors.latest).not.toHaveBeenCalled();
    expect(empty.anchors.put).not.toHaveBeenCalled();
  });

  it('ancre plus avancée que la tête : alerte (chaîne tronquée), rien n’est écrit', async () => {
    const { deps: d, anchors, logs } = deps();
    anchors.latest.mockResolvedValue({ position: 12, hash: HASH });
    await createAuditHandlers(d)['anchor-head']();
    expect(anchors.put).not.toHaveBeenCalled();
    expect(logs).toContainEqual({
      level: 'error',
      event: 'audit.anchor.ahead',
      fields: { anchorPosition: 12, headPosition: 9 },
    });
  });

  it('position déjà ancrée par un autre worker : `exists`, sans erreur', async () => {
    const { deps: d, anchors, logs } = deps();
    anchors.put.mockResolvedValue('exists');
    await createAuditHandlers(d)['anchor-head']();
    expect(logs).toContainEqual({
      level: 'info',
      event: 'audit.anchor.exists',
      fields: { position: 9 },
    });
  });

  it('sans bucket d’ancres : le job est sans effet', async () => {
    const { deps: d, logs, head } = deps({ anchors: undefined });
    await createAuditHandlers(d)['anchor-head']();
    expect(head).not.toHaveBeenCalled();
    expect(logs).toEqual([{ level: 'info', event: 'audit.anchor.disabled', fields: {} }]);
  });
});

describe('verify-chain (CP-23)', () => {
  it('vérifie contre la dernière ancre ; intègre : journal d’information', async () => {
    const { deps: d, anchors, logs, check } = deps();
    anchors.latest.mockResolvedValue({ position: 9, hash: HASH });
    await createAuditHandlers(d)['verify-chain']();
    expect(check).toHaveBeenCalledWith({ position: 9, hash: HASH });
    expect(logs).toContainEqual({
      level: 'info',
      event: 'audit.chain.verified',
      fields: { headPosition: 9, anchorPosition: 9 },
    });
  });

  it('défaut : alerte avec la position seule', async () => {
    const { deps: d, logs } = deps({
      check: () =>
        Promise.resolve({
          checkedAt: new Date(),
          headPosition: 9,
          anchorPosition: null,
          defectPosition: 4,
        }),
      anchors: undefined,
    });
    await createAuditHandlers(d)['verify-chain']();
    expect(logs).toContainEqual({
      level: 'error',
      event: 'audit.chain.broken',
      fields: { defectPosition: 4, headPosition: 9 },
    });
  });

  it('ancre illisible : alerte et échec du job, aucune vérification « sans ancre »', async () => {
    const { deps: d, anchors, logs, check } = deps();
    anchors.latest.mockRejectedValue(new Error('illisible'));
    await expect(createAuditHandlers(d)['verify-chain']()).rejects.toThrow('illisible');
    expect(check).not.toHaveBeenCalled();
    expect(logs).toContainEqual({
      level: 'error',
      event: 'audit.anchor.unreadable',
      fields: { cause: 'Error' },
    });
  });
});

describe('createAuditProcessor', () => {
  it('aiguille les trois jobs ; inconnu ou porteur de données : abandon sans nouvel essai', async () => {
    const handlers = Object.fromEntries(
      AUDIT_JOBS.map((name) => [name, vi.fn(() => Promise.resolve(name))]),
    );
    const { logs, logger: log } = logger();
    const process = createAuditProcessor(handlers as never, log);
    for (const name of AUDIT_JOBS) expect(await process({ name, data: {} })).toBe(name);
    await expect(process({ name: 'audit-wipe', data: {} })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await expect(process({ name: 'verify-chain', data: { anchor: 1 } })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await expect(process({ name: 'verify-chain', data: null })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(logs.filter((l) => l.event === 'audit.maintenance.invalid_job')).toHaveLength(3);
  });
});

describe('createAuditHandlers (câblage)', () => {
  it('branche les fonctions de la base du worker', async () => {
    const db = {} as never;
    const anchors = { latest: vi.fn(() => Promise.resolve(null)), put: vi.fn() };
    const { createAuditDependencies } = await import('./audit-maintenance.js');
    const wired = createAuditDependencies({ db, anchors, logger: logger().logger });
    await wired.maintainPartitions();
    await wired.head();
    await wired.check(null);
    expect(oz.maintainAuditPartitions).toHaveBeenCalledWith(db);
    expect(oz.auditChainHead).toHaveBeenCalledWith(db);
    expect(oz.checkAuditChain).toHaveBeenCalledWith(db, null);
    expect(wired.anchors).toBe(anchors);
  });
});

describe('scheduleAuditMaintenance', () => {
  const queue = (): SchedulerQueue & { calls: unknown[][] } => {
    const calls: unknown[][] = [];
    return {
      calls,
      upsertJobScheduler: vi.fn((...args: unknown[]) => {
        calls.push(['upsert', ...args]);
        return Promise.resolve();
      }),
      removeJobScheduler: vi.fn((id: string) => {
        calls.push(['remove', id]);
        return Promise.resolve();
      }),
    };
  };
  const schedule = { enabled: true, anchorEveryMinutes: 60, verifyEveryMinutes: 1440 };

  it('trois planifications à identifiant fixe, sans données, un seul essai', async () => {
    const q = queue();
    await scheduleAuditMaintenance(q, { ...schedule, anchoring: true });
    const opts = { attempts: 1, removeOnComplete: 100, removeOnFail: 100 };
    expect(q.calls).toEqual([
      [
        'upsert',
        'maintain-partitions',
        { every: 86_400_000 },
        { name: 'maintain-partitions', data: {}, opts },
      ],
      ['upsert', 'anchor-head', { every: 3_600_000 }, { name: 'anchor-head', data: {}, opts }],
      ['upsert', 'verify-chain', { every: 86_400_000 }, { name: 'verify-chain', data: {}, opts }],
    ]);
  });

  it('sans bucket d’ancres : ancrage retiré ; désactivé : tout retiré', async () => {
    const q = queue();
    await scheduleAuditMaintenance(q, { ...schedule, anchoring: false });
    expect(q.calls.map((c) => [c[0], c[1]])).toEqual([
      ['upsert', 'maintain-partitions'],
      ['remove', 'anchor-head'],
      ['upsert', 'verify-chain'],
    ]);
    const off = queue();
    await scheduleAuditMaintenance(off, { ...schedule, enabled: false, anchoring: true });
    expect(off.calls).toEqual(AUDIT_JOBS.map((name) => ['remove', name]));
  });
});

describe('observeAuditMaintenance', () => {
  it('échec : nom connu et type d’erreur seuls ; nom inconnu non repris', () => {
    const worker = new EventEmitter();
    const { logs, logger: log } = logger();
    observeAuditMaintenance(worker, log);
    worker.emit('failed', { name: 'verify-chain' }, new TypeError('secret'));
    worker.emit('failed', { name: 'inconnu' }, new Error('x'));
    worker.emit('failed', undefined, new Error('x'));
    worker.emit('error', new RangeError('y'));
    expect(logs).toEqual([
      {
        level: 'warn',
        event: 'audit.maintenance.failed',
        fields: { job: 'verify-chain', cause: 'TypeError' },
      },
      {
        level: 'warn',
        event: 'audit.maintenance.failed',
        fields: { job: undefined, cause: 'Error' },
      },
      {
        level: 'warn',
        event: 'audit.maintenance.failed',
        fields: { job: undefined, cause: 'Error' },
      },
      { level: 'error', event: 'audit.maintenance.error', fields: { cause: 'RangeError' } },
    ]);
  });
});
