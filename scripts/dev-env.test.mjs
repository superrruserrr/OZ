import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureEnvFile,
  healthReport,
  parseComposePs,
  resolveDocker,
  shouldReset,
  waitUntil,
} from './dev-env.mjs';

describe('resolveDocker', () => {
  const home = '/Users/test';
  it('préfère le docker du PATH', () => {
    expect(resolveDocker({ home, inPath: true, exists: () => true })).toBe('docker');
  });

  it('retrouve Docker Desktop installé hors du PATH (~/.docker/bin, puis l’application)', () => {
    expect(
      resolveDocker({ home, inPath: false, exists: (p) => p === '/Users/test/.docker/bin/docker' }),
    ).toBe('/Users/test/.docker/bin/docker');
    expect(
      resolveDocker({
        home,
        inPath: false,
        exists: (p) => p === '/Applications/Docker.app/Contents/Resources/bin/docker',
      }),
    ).toBe('/Applications/Docker.app/Contents/Resources/bin/docker');
  });

  it('renvoie null quand Docker n’est installé nulle part', () => {
    expect(resolveDocker({ home, inPath: false, exists: () => false })).toBeNull();
  });
});

const SERVICES = ['postgres', 'redis', 's3', 'clamav', 'mailpit'];

describe('parseComposePs', () => {
  it('lit la sortie JSON ligne par ligne de docker compose ps', () => {
    const out = [
      '{"Service":"postgres","State":"running","Health":"healthy"}',
      '{"Service":"redis","State":"running","Health":"starting"}',
    ].join('\n');
    expect(parseComposePs(out)).toEqual(
      new Map([
        ['postgres', { state: 'running', health: 'healthy' }],
        ['redis', { state: 'running', health: 'starting' }],
      ]),
    );
  });

  it('lit aussi la forme tableau JSON des anciennes versions', () => {
    const out = '[{"Service":"s3","State":"exited","Health":""}]';
    expect(parseComposePs(out).get('s3')).toEqual({ state: 'exited', health: '' });
  });

  it('refuse une sortie illisible plutôt que de la croire vide', () => {
    expect(() => parseComposePs('pas du json')).toThrow();
  });
});

describe('healthReport', () => {
  it('signale les services absents, arrêtés ou pas encore sains', () => {
    const statuses = new Map([
      ['postgres', { state: 'running', health: 'healthy' }],
      ['redis', { state: 'running', health: 'starting' }],
      ['s3', { state: 'exited', health: '' }],
      ['clamav', { state: 'running', health: 'unhealthy' }],
    ]);
    const report = healthReport(statuses, SERVICES);
    expect(report.ready).toBe(false);
    expect(report.failed).toEqual(['clamav (unhealthy)', 's3 (exited)']);
    expect(report.pending).toEqual(['mailpit (absent)', 'redis (starting)']);
  });

  it('est prêt quand les cinq services sont healthy', () => {
    const statuses = new Map(SERVICES.map((s) => [s, { state: 'running', health: 'healthy' }]));
    expect(healthReport(statuses, SERVICES)).toEqual({ ready: true, pending: [], failed: [] });
  });
});

describe('waitUntil', () => {
  it('renvoie dès que la condition est remplie', async () => {
    let calls = 0;
    const clock = { t: 0 };
    const result = await waitUntil(() => ++calls >= 3, {
      timeoutMs: 10_000,
      intervalMs: 1_000,
      now: () => clock.t,
      sleep: async (ms) => {
        clock.t += ms;
      },
    });
    expect(result).toEqual({ ok: true, elapsedMs: 2_000 });
  });

  it('abandonne au délai maximal au lieu de boucler sans fin', async () => {
    const clock = { t: 0 };
    const result = await waitUntil(() => false, {
      timeoutMs: 5_000,
      intervalMs: 1_000,
      now: () => clock.t,
      sleep: async (ms) => {
        clock.t += ms;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(5_000);
  });
});

describe('ensureEnvFile', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('crée .env depuis .env.example s’il manque', () => {
    dir = mkdtempSync(join(tmpdir(), 'oz-env-'));
    writeFileSync(join(dir, '.env.example'), 'POSTGRES_USER=oz\n');
    expect(ensureEnvFile(dir)).toBe('created');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('POSTGRES_USER=oz\n');
  });

  it('ne touche jamais à un .env existant', () => {
    dir = mkdtempSync(join(tmpdir(), 'oz-env-'));
    writeFileSync(join(dir, '.env.example'), 'POSTGRES_USER=oz\n');
    writeFileSync(join(dir, '.env'), 'POSTGRES_USER=autre\n');
    expect(ensureEnvFile(dir)).toBe('kept');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('POSTGRES_USER=autre\n');
  });

  it('échoue si .env.example manque aussi', () => {
    dir = mkdtempSync(join(tmpdir(), 'oz-env-'));
    expect(() => ensureEnvFile(dir)).toThrow(/\.env\.example/);
    expect(existsSync(join(dir, '.env'))).toBe(false);
  });
});

describe('shouldReset', () => {
  it('exige une confirmation explicite', () => {
    expect(shouldReset({ answer: 'oui' })).toBe(true);
    expect(shouldReset({ answer: 'o' })).toBe(false);
    expect(shouldReset({ answer: '' })).toBe(false);
  });

  it('accepte --yes, mais jamais une absence de terminal sans --yes', () => {
    expect(shouldReset({ yesFlag: true })).toBe(true);
    expect(shouldReset({ interactive: false })).toBe(false);
  });
});
