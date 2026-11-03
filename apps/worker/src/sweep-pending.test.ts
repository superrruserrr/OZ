import type { ScanVerdict, StalePending } from '@oz/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCAN_JOB_OPTIONS, sweepPending, type SweepDependencies } from './sweep-pending.js';

// Balayage des analyses abandonnées (lot 1.9cb, tâche 5, D-099) avec des doublures.

const A = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const B = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708193';

let stale: StalePending[];
let states: Map<string, string>;
let calls: string[];
let finishOutcome: 'done' | 'skipped';
let logs: { level: string; event: string; fields: Record<string, unknown> }[];
let deps: SweepDependencies;

beforeEach(() => {
  stale = [];
  states = new Map();
  calls = [];
  finishOutcome = 'done';
  logs = [];
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  deps = {
    listStale: () => Promise.resolve(stale),
    finish: (id: string, verdict: ScanVerdict) => {
      calls.push(`finish:${id}:${verdict.verdict}`);
      return Promise.resolve(finishOutcome);
    },
    queue: {
      getJob: (id) => {
        const state = states.get(id);
        if (state === undefined) return Promise.resolve(undefined);
        return Promise.resolve({
          getState: () => Promise.resolve(state),
          retry: (from, options) => {
            calls.push(`retry:${id}:${from}:${JSON.stringify(options)}`);
            return Promise.resolve();
          },
        });
      },
      add: (name, data, options) => {
        calls.push(`add:${name}:${data.documentId}:${JSON.stringify(options)}`);
        return Promise.resolve();
      },
    },
    logger: { info: log('info'), warn: log('warn'), error: log('error') },
  };
});

describe('sweepPending', () => {
  it('job absent : remis en file avec les options de l’API et l’identifiant du document', async () => {
    stale = [{ id: A, action: 'requeue' }];
    expect(await sweepPending(deps, 100)).toEqual({ requeued: 1, failed: 0, errors: 0 });
    expect(calls).toEqual([
      `add:scan-document:${A}:${JSON.stringify({ ...SCAN_JOB_OPTIONS, jobId: A })}`,
    ]);
    expect(logs).toContainEqual({
      level: 'warn',
      event: 'document.scan.requeued',
      fields: { documentId: A },
    });
  });

  it.each(['failed', 'completed'])('job %s : rejoué, essais remis à zéro', async (state) => {
    stale = [{ id: A, action: 'requeue' }];
    states.set(A, state);
    expect((await sweepPending(deps, 1)).requeued).toBe(1);
    expect(calls).toEqual([
      `retry:${A}:${state}:${JSON.stringify({ resetAttemptsMade: true, resetAttemptsStarted: true })}`,
    ]);
  });

  it.each(['waiting', 'delayed', 'active', 'prioritized'])('job %s : rien', async (state) => {
    stale = [{ id: A, action: 'requeue' }];
    states.set(A, state);
    expect(await sweepPending(deps, 1)).toEqual({ requeued: 0, failed: 0, errors: 0 });
    expect(calls).toEqual([]);
  });

  it('après 24 heures : verdict `error` et alerte ; déjà jugé : rien', async () => {
    stale = [{ id: A, action: 'fail' }];
    expect(await sweepPending(deps, 1)).toEqual({ requeued: 0, failed: 1, errors: 0 });
    expect(calls).toEqual([`finish:${A}:error`]);
    expect(logs).toContainEqual({
      level: 'error',
      event: 'document.scan.stalled',
      fields: { documentId: A },
    });
    finishOutcome = 'skipped';
    logs = [];
    expect((await sweepPending(deps, 1)).failed).toBe(0);
    expect(logs.map((l) => l.event)).toEqual(['document.scan.sweep_done']);
  });

  it('une erreur n’interrompt pas le lot ; cause par son nom seul', async () => {
    stale = [
      { id: A, action: 'requeue' },
      { id: B, action: 'fail' },
    ];
    deps.queue.getJob = () => Promise.reject(new TypeError('redis://secret'));
    expect(await sweepPending(deps, 2)).toEqual({ requeued: 0, failed: 1, errors: 1 });
    expect(logs).toContainEqual({
      level: 'warn',
      event: 'document.scan.sweep_failed',
      fields: { documentId: A, cause: 'TypeError' },
    });
    const notAnError: unknown = 'chaîne';
    deps.queue.getJob = async () => {
      await Promise.resolve();
      throw notAnError;
    };
    stale = [{ id: A, action: 'requeue' }];
    await sweepPending(deps, 1);
    expect(logs.at(-2)?.fields.cause).toBe('inconnue');
    expect(JSON.stringify(logs)).not.toContain('secret');
  });
});
