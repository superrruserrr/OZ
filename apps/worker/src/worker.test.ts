import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { observe, runMain, stopOnSignals, type SignalTarget } from './worker.js';

// Démarrage et arrêt du worker (lot 1.9b, tâche 6) ; le démarrage réel est couvert par
// `test/pipeline.int.test.ts`.

const valid = {
  NODE_ENV: 'development',
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://oz:oz@localhost:5432/oz',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'fr-par',
  S3_BUCKET: 'oz-documents',
  S3_ACCESS_KEY: 'oz-dev-access',
  S3_SECRET_KEY: 'super-secret-value',
  CLAMAV_HOST: 'localhost',
};

describe('runMain', () => {
  it('configuration invalide : code 1, variables nommées sans leurs valeurs, rien démarré', async () => {
    const stderr = vi.fn();
    const start = vi.fn();
    expect(await runMain({ ...valid, CLAMAV_HOST: undefined }, { stderr, start })).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('CLAMAV_HOST'));
    expect(String(stderr.mock.calls[0]?.[0])).not.toContain(valid.S3_SECRET_KEY);
  });

  it('configuration valide : démarre, code 0', async () => {
    const start = vi.fn(() => Promise.resolve());
    expect(await runMain(valid, { stderr: vi.fn(), start })).toBe(0);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ clamav: { host: 'localhost', port: 3310 } }),
    );
  });

  it('démarrage impossible : code 1, type d’erreur seul, ni message ni pile', async () => {
    const stderr = vi.fn();
    const start = vi.fn(() =>
      Promise.reject(new TypeError('redis://oz:secret@10.0.0.6 injoignable')),
    );
    expect(await runMain(valid, { stderr, start })).toBe(1);
    expect(stderr).toHaveBeenCalledWith('✖ Démarrage impossible (TypeError)\n');
  });

  it('démarrage rejeté par une valeur qui n’est pas une Error : cause « inconnue »', async () => {
    const stderr = vi.fn();
    const notAnError: unknown = 'x';
    const start = async () => {
      await Promise.resolve();
      throw notAnError;
    };
    expect(await runMain(valid, { stderr, start })).toBe(1);
    expect(stderr).toHaveBeenCalledWith('✖ Démarrage impossible (inconnue)\n');
  });

  it('erreur autre que de configuration : propagée', async () => {
    const unreadable = new Proxy(
      {},
      {
        get() {
          throw new TypeError('environnement illisible');
        },
      },
    );
    await expect(runMain(unreadable, { stderr: vi.fn(), start: vi.fn() })).rejects.toThrow(
      TypeError,
    );
  });
});

function fakeProcess(): SignalTarget & EventEmitter & { codes: number[] } {
  const target = Object.assign(new EventEmitter(), {
    codes: [] as number[],
    exit(code: number): void {
      target.codes.push(code);
    },
  });
  return target;
}

const logger = () => ({ info: vi.fn(), error: vi.fn() });

describe('stopOnSignals', () => {
  it.each(['SIGTERM', 'SIGINT'])(
    '%s : jobs en cours terminés, connexions fermées, sortie 0',
    async (signal) => {
      const proc = fakeProcess();
      const close = vi.fn(() => Promise.resolve());
      const log = logger();
      stopOnSignals({ close }, log, proc);
      proc.emit(signal);
      await vi.waitFor(() => {
        expect(proc.codes).toEqual([0]);
      });
      expect(close).toHaveBeenCalledOnce();
      expect(log.info).toHaveBeenCalledWith({ signal }, 'worker.stopping');
    },
  );

  it('second signal pendant l’arrêt : ignoré', async () => {
    const proc = fakeProcess();
    let release = (): void => undefined;
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    stopOnSignals({ close }, logger(), proc);
    proc.emit('SIGTERM');
    proc.emit('SIGINT');
    release();
    await vi.waitFor(() => {
      expect(proc.codes).toEqual([0]);
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fermeture en échec : journalisée, sortie 1', async () => {
    const proc = fakeProcess();
    const log = logger();
    stopOnSignals({ close: () => Promise.reject(new Error('redis')) }, log, proc);
    proc.emit('SIGTERM');
    await vi.waitFor(() => {
      expect(proc.codes).toEqual([1]);
    });
    expect(log.error).toHaveBeenCalledWith({ cause: 'Error' }, 'worker.stop_failed');
  });
  it('fermeture rejetée par une valeur qui n’est pas une Error : cause « inconnue »', async () => {
    const proc = fakeProcess();
    const log = logger();
    const notAnError: unknown = 'redis';
    stopOnSignals(
      {
        close: async () => {
          await Promise.resolve();
          throw notAnError;
        },
      },
      log,
      proc,
    );
    proc.emit('SIGINT');
    await vi.waitFor(() => {
      expect(proc.codes).toEqual([1]);
    });
    expect(log.error).toHaveBeenCalledWith({ cause: 'inconnue' }, 'worker.stop_failed');
  });
});

describe('observe', () => {
  it('essai en échec et erreur du worker : type d’erreur seul, sans message', () => {
    const events = new EventEmitter();
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    observe(events, log);
    events.emit('failed', { id: 'abc', attemptsMade: 2 }, new TypeError('quarantine/secret'));
    events.emit('failed', undefined, new Error('x'));
    events.emit('error', new RangeError('redis://u:p@h'));
    expect(log.warn).toHaveBeenNthCalledWith(
      1,
      { jobId: 'abc', attemptsMade: 2, cause: 'TypeError' },
      'document.scan.attempt_failed',
    );
    expect(log.warn).toHaveBeenNthCalledWith(
      2,
      { jobId: undefined, attemptsMade: undefined, cause: 'Error' },
      'document.scan.attempt_failed',
    );
    expect(log.error).toHaveBeenCalledWith({ cause: 'RangeError' }, 'worker.error');
    expect(JSON.stringify([log.warn.mock.calls, log.error.mock.calls])).not.toMatch(
      /quarantine|redis:/,
    );
  });
});
