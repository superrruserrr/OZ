// scripts/next-standalone-assets.mjs : copie de .next/static et public/ dans le serveur autonome.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = new URL('./next-standalone-assets.mjs', import.meta.url).pathname;
const roots = [];

/** Monorepo factice : <racine>/apps/demo avec un build standalone. */
function fixture({ withPublic = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oz-standalone-'));
  roots.push(root);
  const app = join(root, 'apps', 'demo');
  const target = join(app, '.next', 'standalone', 'apps', 'demo');
  mkdirSync(target, { recursive: true });
  mkdirSync(join(app, '.next', 'static', 'chunks'), { recursive: true });
  writeFileSync(join(app, '.next', 'static', 'chunks', 'a.js'), 'a');
  if (withPublic) {
    mkdirSync(join(app, 'public'));
    writeFileSync(join(app, 'public', 'robots.txt'), 'r');
  }
  return { app, target };
}

const run = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('next-standalone-assets', () => {
  it('copie .next/static et public/ dans le serveur autonome', () => {
    const { app, target } = fixture();
    expect(run(app).status).toBe(0);
    expect(readFileSync(join(target, '.next', 'static', 'chunks', 'a.js'), 'utf8')).toBe('a');
    expect(readFileSync(join(target, 'public', 'robots.txt'), 'utf8')).toBe('r');
  });

  it('peut être relancé sans imbriquer static/static', () => {
    const { app, target } = fixture();
    run(app);
    expect(run(app).status).toBe(0);
    expect(existsSync(join(target, '.next', 'static', 'static'))).toBe(false);
  });

  it('retire un public/ périmé quand l’application n’en a plus', () => {
    const { app, target } = fixture();
    run(app);
    rmSync(join(app, 'public'), { recursive: true });
    expect(run(app).status).toBe(0);
    expect(existsSync(join(target, 'public'))).toBe(false);
  });

  it('échoue si la sortie standalone est absente', () => {
    const { app, target } = fixture({ withPublic: false });
    rmSync(target, { recursive: true });
    const result = run(app);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/standalone introuvable/);
  });
});
