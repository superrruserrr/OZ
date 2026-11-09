import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '@oz/db';
import {
  ACCOUNT_DELETION_BATCH,
  ACCOUNT_DELETION_JOB,
  anonymizeDueAccounts,
  createAccountDeletionDependencies,
  createAccountDeletionProcessor,
  observeAccountDeletion,
  scheduleAccountDeletion,
  type AccountDeletionDependencies,
} from './account-deletion.js';

// Suppression de compte planifiée (lot 1.16cba, tâche 3) avec des doublures.

vi.mock('@oz/db', () => ({
  dueAccountDeletions: vi.fn(() => Promise.resolve([])),
  anonymizeAccount: vi.fn(() => Promise.resolve('done')),
}));

const A = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708191';
const B = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const C = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708193';
const D = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708194';
const SECRET = 'titulaire@example.test';

let logs: { level: string; event: string; fields: Record<string, unknown> }[];
const log =
  (level: string) =>
  (fields: Record<string, unknown>, event: string): void => {
    logs.push({ level, event, fields });
  };
const logger = { info: log('info'), warn: log('warn'), error: log('error') };

beforeEach(() => {
  logs = [];
});

const depsWith = (
  due: string[],
  outcomes: Record<string, db.AccountAnonymizeOutcome | Error>,
): AccountDeletionDependencies & { limits: number[]; done: string[] } => {
  const limits: number[] = [];
  const done: string[] = [];
  return {
    limits,
    done,
    listDue: (limit) => {
      limits.push(limit);
      return Promise.resolve(due);
    },
    anonymize: (id) => {
      done.push(id);
      const outcome = outcomes[id];
      return outcome instanceof Error
        ? Promise.reject(outcome)
        : Promise.resolve(outcome ?? 'done');
    },
    logger,
  };
};

describe('anonymizeDueAccounts', () => {
  it('rien d’échu : aucun journal', async () => {
    const deps = depsWith([], {});
    expect(await anonymizeDueAccounts(deps)).toEqual({
      done: 0,
      frozen: 0,
      majority: 0,
      skipped: 0,
      errors: 0,
    });
    expect(deps.limits).toEqual([ACCOUNT_DELETION_BATCH]);
    expect(logs).toEqual([]);
  });

  it('une à une ; un échec isolé n’arrête pas le lot, journalisé par son type seul', async () => {
    const deps = depsWith([A, B, C, D], {
      [A]: 'done',
      [B]: new TypeError(SECRET),
      [C]: 'frozen',
      [D]: 'cancelled',
    });
    expect(await anonymizeDueAccounts(deps)).toEqual({
      done: 1,
      frozen: 1,
      majority: 0,
      skipped: 1,
      errors: 1,
    });
    expect(deps.done).toEqual([A, B, C, D]);
    expect(logs).toEqual([
      {
        level: 'warn',
        event: 'account.deletion.failed',
        fields: { requestId: B, cause: 'TypeError' },
      },
      { level: 'warn', event: 'account.deletion.frozen', fields: { frozen: 1 } },
      {
        level: 'info',
        event: 'account.deletion.run',
        fields: { done: 1, frozen: 1, majority: 0, skipped: 1, errors: 1 },
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain(SECRET);
  });

  it('erreur non typée : cause « unknown »', async () => {
    const deps = depsWith([A], {});
    deps.anonymize = () => {
      throw SECRET as unknown as Error;
    };
    expect((await anonymizeDueAccounts(deps)).errors).toBe(1);
    expect(logs[0]?.fields).toEqual({ requestId: A, cause: 'unknown' });
  });

  it('enfant devenu majeur : comptée et journalisée sans donnée (lot 1.16cbb)', async () => {
    const deps = depsWith([A], { [A]: 'majority' });
    expect(await anonymizeDueAccounts(deps)).toEqual({
      done: 0,
      frozen: 0,
      majority: 1,
      skipped: 0,
      errors: 0,
    });
    expect(logs).toEqual([
      {
        level: 'info',
        event: 'account.deletion.run',
        fields: { done: 0, frozen: 0, majority: 1, skipped: 0, errors: 0 },
      },
    ]);
  });

  it('issues « not_due » et « unknown » comptées à part', async () => {
    const deps = depsWith([A, B], { [A]: 'not_due', [B]: 'unknown' });
    expect(await anonymizeDueAccounts(deps)).toEqual({
      done: 0,
      frozen: 0,
      majority: 0,
      skipped: 2,
      errors: 0,
    });
  });
});

describe('createAccountDeletionProcessor', () => {
  it('job planifié vide : exécute le passage', async () => {
    const run = vi.fn(() => Promise.resolve('ok'));
    const process = createAccountDeletionProcessor(run, logger);
    expect(await process({ name: ACCOUNT_DELETION_JOB, data: {} })).toBe('ok');
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    { name: 'autre', data: {} },
    { name: ACCOUNT_DELETION_JOB, data: { requestId: A } },
    { name: ACCOUNT_DELETION_JOB, data: null },
    { name: ACCOUNT_DELETION_JOB, data: 'x' },
  ])('job hors contrat abandonné sans nouvel essai ($name)', async (job) => {
    const run = vi.fn();
    const process = createAccountDeletionProcessor(run, logger);
    await expect(process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(run).not.toHaveBeenCalled();
    expect(logs).toEqual([{ level: 'error', event: 'account.deletion.invalid_job', fields: {} }]);
  });
});

describe('scheduleAccountDeletion', () => {
  const queue = () => ({
    upsertJobScheduler: vi.fn(() => Promise.resolve()),
    removeJobScheduler: vi.fn(() => Promise.resolve(true)),
  });

  it('active : planification idempotente à la cadence configurée, un seul essai', async () => {
    const q = queue();
    await scheduleAccountDeletion(q, { enabled: true, everyMinutes: 60 });
    expect(q.upsertJobScheduler).toHaveBeenCalledWith(
      ACCOUNT_DELETION_JOB,
      { every: 3_600_000 },
      {
        name: ACCOUNT_DELETION_JOB,
        data: {},
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
      },
    );
    expect(q.removeJobScheduler).not.toHaveBeenCalled();
  });

  it('désactivée : planification retirée', async () => {
    const q = queue();
    await scheduleAccountDeletion(q, { enabled: false, everyMinutes: 60 });
    expect(q.removeJobScheduler).toHaveBeenCalledWith(ACCOUNT_DELETION_JOB);
    expect(q.upsertJobScheduler).not.toHaveBeenCalled();
  });
});

describe('observeAccountDeletion', () => {
  it('nom de job connu et type d’erreur seuls', () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    observeAccountDeletion(
      {
        on: (event: string, listener: (...args: never[]) => void) => {
          listeners[event] = listener as (...args: unknown[]) => void;
        },
      },
      logger,
    );
    listeners.failed?.({ name: ACCOUNT_DELETION_JOB }, new TypeError(SECRET));
    listeners.failed?.({ name: SECRET }, new Error('x'));
    listeners.failed?.(undefined, new Error('x'));
    listeners.error?.(new RangeError(SECRET));
    expect(logs).toEqual([
      {
        level: 'warn',
        event: 'account.deletion.attempt_failed',
        fields: { job: ACCOUNT_DELETION_JOB, cause: 'TypeError' },
      },
      {
        level: 'warn',
        event: 'account.deletion.attempt_failed',
        fields: { job: undefined, cause: 'Error' },
      },
      {
        level: 'warn',
        event: 'account.deletion.attempt_failed',
        fields: { job: undefined, cause: 'Error' },
      },
      { level: 'error', event: 'account.deletion.error', fields: { cause: 'RangeError' } },
    ]);
  });
});

describe('createAccountDeletionDependencies', () => {
  it('délègue à la base du worker', async () => {
    const base = {} as Parameters<typeof db.anonymizeAccount>[0];
    const deps = createAccountDeletionDependencies({ db: base, logger });
    await deps.listDue(100);
    await deps.anonymize(A);
    expect(db.dueAccountDeletions).toHaveBeenCalledWith(base, 100);
    expect(db.anonymizeAccount).toHaveBeenCalledWith(base, A);
    expect(deps.logger).toBe(logger);
  });
});
