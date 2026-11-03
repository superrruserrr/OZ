import type { DueDataExport, PersonalDataExport } from '@oz/db';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '@oz/db';
import {
  buildDataExport,
  causeOf,
  createDataExportDependencies,
  createDataExportMaintenanceDependencies,
  observeDataExport,
  createDataExportProcessor,
  DATA_EXPORT_JOB,
  DATA_EXPORT_JOB_OPTIONS,
  DATA_EXPORT_MAINTENANCE_JOB,
  maintainDataExports,
  scheduleDataExportMaintenance,
  type DataExportDependencies,
  type DataExportMaintenanceDependencies,
} from './data-export.js';

// Export des données personnelles (lot 1.16bb, tâches 3 et 4) avec des doublures.

vi.mock('@oz/db', () => ({
  claimDataExport: vi.fn(() => Promise.resolve('u')),
  personalDataExport: vi.fn(() => Promise.resolve({})),
  finishDataExport: vi.fn(() => Promise.resolve('done')),
  failDataExport: vi.fn(() => Promise.resolve('done')),
  listDueDataExports: vi.fn(() => Promise.resolve([])),
  expireDataExport: vi.fn(() => Promise.resolve(true)),
}));

const REQ = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const OTHER = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708193';
const THIRD = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708196';
const USER = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708194';
const EMAIL = 'titulaire@example.test';
const DATA = { formatVersion: 1, account: { email: EMAIL } } as unknown as PersonalDataExport;

let calls: string[];
let logs: { level: string; event: string; fields: Record<string, unknown> }[];
let owner: string | null;
let data: PersonalDataExport | null;
let finished: string;
let putError: Error | undefined;
let mailError: Error | undefined;
let failOutcome: 'done' | 'ready';
let deps: DataExportDependencies;

const log =
  (level: string) =>
  (fields: Record<string, unknown>, event: string): void => {
    logs.push({ level, event, fields });
  };
const logger = { info: log('info'), warn: log('warn'), error: log('error') };

beforeEach(() => {
  calls = [];
  logs = [];
  owner = USER;
  data = DATA;
  finished = 'done';
  putError = undefined;
  mailError = undefined;
  failOutcome = 'done';
  deps = {
    claim: (id) => {
      calls.push(`claim:${id}`);
      return Promise.resolve(owner);
    },
    build: (userId) => {
      calls.push(`build:${userId}`);
      return Promise.resolve(data);
    },
    finish: (id) => {
      calls.push(`finish:${id}`);
      return Promise.resolve(finished as 'done');
    },
    fail: (id, reason) => {
      calls.push(`fail:${id}:${reason}`);
      return Promise.resolve(failOutcome);
    },
    storage: {
      putExport: (key, body) => {
        calls.push(`put:${key}:${new TextDecoder().decode(body)}`);
        return putError === undefined ? Promise.resolve() : Promise.reject(putError);
      },
      remove: (key) => {
        calls.push(`remove:${key}`);
        return Promise.resolve();
      },
    },
    notify: (to) => {
      calls.push(`mail:${to}`);
      return mailError === undefined ? Promise.resolve() : Promise.reject(mailError);
    },
    logger,
  };
});

const noPersonalData = (): void => {
  const text = JSON.stringify(logs);
  expect(text).not.toContain(EMAIL);
  expect(text).not.toContain(USER);
  expect(text).not.toContain('formatVersion');
};

describe('buildDataExport', () => {
  it('prise, assemblage, écriture du JSON de la base, fin, puis email unique', async () => {
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('ready');
    expect(calls).toEqual([
      `claim:${REQ}`,
      `build:${USER}`,
      `put:exports/${REQ}.json:${JSON.stringify(DATA)}`,
      `finish:${REQ}`,
      `mail:${EMAIL}`,
    ]);
    expect(logs.map((l) => l.event)).toEqual(['data.export.ready']);
    noPersonalData();
  });

  it('demande plus à produire (rejouée après succès) : sans effet', async () => {
    owner = null;
    expect(await buildDataExport(deps, REQ, { lastAttempt: true })).toBe('skipped');
    expect(calls).toEqual([`claim:${REQ}`]);
  });

  it('compte disparu : `failed` motif account_gone, aucun objet ni email', async () => {
    data = null;
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('failed');
    expect(calls).toEqual([`claim:${REQ}`, `build:${USER}`, `fail:${REQ}:account_gone`]);
    noPersonalData();
  });

  it('exécution en double (déjà prête) : archive gardée, pas d’email', async () => {
    finished = 'ready';
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('skipped');
    expect(calls.at(-1)).toBe(`finish:${REQ}`);
  });

  it('compte disparu avant la fin : archive retirée, `failed`', async () => {
    finished = 'account_gone';
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('failed');
    expect(calls.slice(-2)).toEqual([`finish:${REQ}`, `remove:exports/${REQ}.json`]);
  });

  it('dernier essai mais demande déjà prête : archive gardée ; échec de `fail` journalisé', async () => {
    putError = new Error('boom');
    failOutcome = 'ready';
    await expect(buildDataExport(deps, REQ, { lastAttempt: true })).rejects.toBe(putError);
    expect(calls.some((c) => c.startsWith('remove:'))).toBe(false);
    deps = { ...deps, fail: () => Promise.reject(new RangeError('base')) };
    await expect(buildDataExport(deps, REQ, { lastAttempt: true })).rejects.toBe(putError);
    expect(logs.at(-1)).toMatchObject({
      event: 'data.export.fail_failed',
      fields: { cause: 'RangeError' },
    });
  });

  it('demande close pendant l’écriture : objet retiré, pas d’email', async () => {
    finished = 'failed';
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('skipped');
    expect(calls.slice(-2)).toEqual([`finish:${REQ}`, `remove:exports/${REQ}.json`]);
  });

  it('erreur : rejouée par BullMQ ; au dernier essai, `failed` build_failed et objet retiré', async () => {
    putError = new Error(`stockage ${EMAIL}`);
    await expect(buildDataExport(deps, REQ, { lastAttempt: false })).rejects.toBe(putError);
    expect(calls).not.toContain(`fail:${REQ}:build_failed`);
    calls = [];
    await expect(buildDataExport(deps, REQ, { lastAttempt: true })).rejects.toBe(putError);
    expect(calls.slice(-2)).toEqual([`fail:${REQ}:build_failed`, `remove:exports/${REQ}.json`]);
    noPersonalData();
  });

  it('échec SMTP : journalisé par son type seul, archive prête quand même', async () => {
    mailError = new TypeError(`refusé pour ${EMAIL}`);
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('ready');
    expect(logs.at(-1)).toEqual({
      level: 'warn',
      event: 'data.export.mail_failed',
      fields: { requestId: REQ, cause: 'TypeError' },
    });
    noPersonalData();
  });

  it('sans SMTP : aucun email', async () => {
    deps = { ...deps, notify: undefined };
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('ready');
    expect(calls.some((c) => c.startsWith('mail:'))).toBe(false);
  });
});

describe('createDataExportProcessor', () => {
  const job = (name: string, payload: unknown, attemptsMade = 0) => ({
    name,
    data: payload,
    attemptsMade,
    opts: { attempts: 3 },
  });

  it('build-export : dernier essai au troisième', async () => {
    putError = new Error('boom');
    const processor = createDataExportProcessor(deps, () => Promise.resolve('maint'));
    await expect(processor(job(DATA_EXPORT_JOB, { requestId: REQ }, 1))).rejects.toThrow();
    expect(calls).not.toContain(`fail:${REQ}:build_failed`);
    await expect(processor(job(DATA_EXPORT_JOB, { requestId: REQ }, 2))).rejects.toThrow();
    expect(calls).toContain(`fail:${REQ}:build_failed`);
  });

  it('maintain-exports sans données : maintenance', async () => {
    const processor = createDataExportProcessor(deps, () => Promise.resolve('maint'));
    expect(await processor(job(DATA_EXPORT_MAINTENANCE_JOB, {}))).toBe('maint');
  });

  it.each([
    ['nom inconnu', 'autre', { requestId: REQ }],
    ['identifiant invalide', DATA_EXPORT_JOB, { requestId: 'x' }],
    ['champ en trop', DATA_EXPORT_JOB, { requestId: REQ, userId: USER }],
    ['maintenance porteuse de données', DATA_EXPORT_MAINTENANCE_JOB, { requestId: REQ }],
  ])('%s : abandonné sans nouvel essai, contenu non journalisé', async (_label, name, payload) => {
    const processor = createDataExportProcessor(deps, () => Promise.resolve('maint'));
    await expect(processor(job(name, payload))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(calls).toEqual([]);
    expect(logs).toEqual([{ level: 'error', event: 'data.export.invalid_job', fields: {} }]);
  });
});

describe('maintainDataExports', () => {
  let due: DueDataExport[];
  let states: Map<string, string>;
  let mdeps: DataExportMaintenanceDependencies;

  beforeEach(() => {
    due = [];
    states = new Map();
    mdeps = {
      listDue: (limit) => {
        calls.push(`due:${String(limit)}`);
        return Promise.resolve(due);
      },
      expire: (id) => {
        calls.push(`expire:${id}`);
        return Promise.resolve(true);
      },
      fail: (id, reason) => {
        calls.push(`fail:${id}:${reason}`);
        return Promise.resolve(id === THIRD ? 'ready' : 'done');
      },
      storage: deps.storage,
      queue: {
        getJob: (id) => {
          const state = states.get(id);
          if (state === undefined) return Promise.resolve(undefined);
          return Promise.resolve({
            getState: () => Promise.resolve(state),
            retry: (from) => {
              calls.push(`retry:${id}:${from}`);
              return Promise.resolve();
            },
          });
        },
        add: (name, payload, options) => {
          calls.push(
            `add:${name}:${payload.requestId}:${options.jobId}:${String(options.attempts)}`,
          );
          return Promise.resolve();
        },
      },
      logger,
    };
  });

  it('échue : objet supprimé puis `expired` ; abandonnée : `failed` puis objet retiré', async () => {
    due = [
      { id: REQ, action: 'expire' },
      { id: OTHER, action: 'fail' },
    ];
    expect(await maintainDataExports(mdeps)).toEqual({
      expired: 1,
      requeued: 0,
      failed: 1,
      errors: 0,
    });
    expect(calls).toEqual([
      'due:100',
      `remove:exports/${REQ}.json`,
      `expire:${REQ}`,
      `fail:${OTHER}:abandoned`,
      `remove:exports/${OTHER}.json`,
    ]);
  });

  it('abandon d’une demande devenue prête entre-temps : archive gardée', async () => {
    due = [{ id: THIRD, action: 'fail' }];
    expect((await maintainDataExports(mdeps)).failed).toBe(0);
    expect(calls).toEqual(['due:100', `fail:${THIRD}:abandoned`]);
  });

  it('sans nouvelle : job absent remis en file, job échoué rejoué, job en attente laissé', async () => {
    const third = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708195';
    due = [
      { id: REQ, action: 'requeue' },
      { id: OTHER, action: 'requeue' },
      { id: third, action: 'requeue' },
    ];
    states.set(OTHER, 'failed');
    states.set(third, 'waiting');
    expect((await maintainDataExports(mdeps)).requeued).toBe(3);
    expect(calls.slice(1)).toEqual([
      `add:${DATA_EXPORT_JOB}:${REQ}:${REQ}:${String(DATA_EXPORT_JOB_OPTIONS.attempts)}`,
      `retry:${OTHER}:failed`,
    ]);
  });

  it('une erreur n’arrête pas les autres demandes', async () => {
    due = [
      { id: REQ, action: 'expire' },
      { id: OTHER, action: 'expire' },
    ];
    let first = true;
    mdeps.storage = {
      remove: (key) => {
        calls.push(`remove:${key}`);
        if (first) {
          first = false;
          return Promise.reject(new Error('panne'));
        }
        return Promise.resolve();
      },
    };
    expect(await maintainDataExports(mdeps)).toMatchObject({ expired: 1, errors: 1 });
    expect(calls).not.toContain(`expire:${REQ}`);
    expect(logs[0]).toMatchObject({ event: 'data.export.maintenance_failed' });
  });
});

describe('scheduleDataExportMaintenance', () => {
  it('pose la planification, ou la retire sans clé', async () => {
    const queue = {
      upsertJobScheduler: (id: string, repeat: { every: number }) => {
        calls.push(`upsert:${id}:${String(repeat.every)}`);
        return Promise.resolve();
      },
      removeJobScheduler: (id: string) => {
        calls.push(`remove:${id}`);
        return Promise.resolve();
      },
    };
    await scheduleDataExportMaintenance(queue, { enabled: true, everyMinutes: 15 });
    await scheduleDataExportMaintenance(queue, { enabled: false, everyMinutes: 15 });
    expect(calls).toEqual([
      `upsert:${DATA_EXPORT_MAINTENANCE_JOB}:900000`,
      `remove:${DATA_EXPORT_MAINTENANCE_JOB}`,
    ]);
  });
});

describe('câblage et observation', () => {
  it('appelle les fonctions de la base avec la clé ; email seulement avec SMTP', async () => {
    const base = {} as Parameters<typeof createDataExportDependencies>[0]['db'];
    const sendDataExportReady = vi.fn(() => Promise.resolve());
    const wired = createDataExportDependencies({
      db: base,
      encryptionKey: 'k'.repeat(40),
      storage: deps.storage,
      mailer: { sendDataExportReady },
      logger,
    });
    await wired.claim(REQ);
    await wired.build(USER);
    await wired.finish(REQ);
    await wired.fail(REQ, 'abandoned');
    await wired.notify?.(EMAIL);
    expect(db.personalDataExport).toHaveBeenCalledWith(base, USER, 'k'.repeat(40));
    expect(db.failDataExport).toHaveBeenCalledWith(base, REQ, 'abandoned');
    expect(sendDataExportReady).toHaveBeenCalledWith(EMAIL);
    expect(
      createDataExportDependencies({
        db: base,
        encryptionKey: 'k',
        storage: deps.storage,
        mailer: undefined,
        logger,
      }).notify,
    ).toBeUndefined();

    const maintenance = createDataExportMaintenanceDependencies({
      db: base,
      storage: deps.storage,
      queue: { getJob: () => Promise.resolve(undefined), add: () => Promise.resolve() },
      logger,
    });
    await maintenance.listDue(10);
    await maintenance.expire(REQ);
    await maintenance.fail(REQ, 'abandoned');
    expect(db.listDueDataExports).toHaveBeenCalledWith(base, 10);
    expect(db.expireDataExport).toHaveBeenCalledWith(base, REQ);
  });

  it('retrait en échec journalisé par son type', async () => {
    finished = 'failed';
    deps.storage.remove = () => Promise.reject(new RangeError(`clé ${EMAIL}`));
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('skipped');
    expect(logs).toContainEqual({
      level: 'error',
      event: 'data.export.remove_failed',
      fields: { requestId: REQ, cause: 'RangeError' },
    });
    noPersonalData();
  });

  it('échecs du worker : nom de job connu et type d’erreur seuls', () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    observeDataExport(
      {
        on: (event: string, listener: (...args: never[]) => void) => {
          listeners[event] = listener as (...args: unknown[]) => void;
        },
      },
      logger,
    );
    listeners.failed?.({ name: DATA_EXPORT_JOB, attemptsMade: 2 }, new TypeError(EMAIL));
    listeners.failed?.({ name: 'inconnu', attemptsMade: 1 }, new Error('x'));
    listeners.failed?.(undefined, new Error('x'));
    listeners.error?.(new RangeError('redis'));
    expect(logs).toEqual([
      {
        level: 'warn',
        event: 'data.export.attempt_failed',
        fields: { job: DATA_EXPORT_JOB, attemptsMade: 2, cause: 'TypeError' },
      },
      {
        level: 'warn',
        event: 'data.export.attempt_failed',
        fields: { job: undefined, attemptsMade: 1, cause: 'Error' },
      },
      {
        level: 'warn',
        event: 'data.export.attempt_failed',
        fields: { job: undefined, attemptsMade: undefined, cause: 'Error' },
      },
      { level: 'error', event: 'data.export.error', fields: { cause: 'RangeError' } },
    ]);
    noPersonalData();
  });
});

describe('cas limites', () => {
  it('cause : type d’erreur, `unknown` pour une valeur non Error', () => {
    expect(causeOf(new RangeError('x'))).toBe('RangeError');
    expect(causeOf('texte')).toBe('unknown');
  });

  it('export sans adresse : prête, aucun email', async () => {
    data = { formatVersion: 1 } as unknown as PersonalDataExport;
    expect(await buildDataExport(deps, REQ, { lastAttempt: false })).toBe('ready');
    expect(calls.some((c) => c.startsWith('mail:'))).toBe(false);
  });

  it('job sans nombre d’essais : dernier essai dès le premier', async () => {
    putError = new Error('boom');
    const processor = createDataExportProcessor(deps, () => Promise.resolve('maint'));
    await expect(
      processor({ name: DATA_EXPORT_JOB, data: { requestId: REQ }, attemptsMade: 0, opts: {} }),
    ).rejects.toThrow();
    expect(calls).toContain(`fail:${REQ}:build_failed`);
  });

  it('expiration déjà faite (autre passage) : non comptée', async () => {
    const counts = await maintainDataExports({
      listDue: () => Promise.resolve([{ id: REQ, action: 'expire' }]),
      expire: () => Promise.resolve(false),
      fail: () => Promise.resolve('done'),
      storage: deps.storage,
      queue: { getJob: () => Promise.resolve(undefined), add: () => Promise.resolve() },
      logger,
    });
    expect(counts).toEqual({ expired: 0, requeued: 0, failed: 0, errors: 0 });
  });
});
