// infra/docker/compose.dev.yml : contrôles statiques (EX-002, EX-T08, EX-T12, EX-T17).
// Le démarrage réel (healthy < 2 min) est vérifié par `pnpm dev:up`.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPOSE = new URL('../infra/docker/compose.dev.yml', import.meta.url);
const text = existsSync(COMPOSE) ? readFileSync(COMPOSE, 'utf8') : '';

/** Blocs de services : clé à deux espaces sous `services:`, jusqu'à la clé de premier niveau suivante. */
function services(yaml) {
  const blocks = new Map();
  let inServices = false;
  let current = null;
  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) {
      inServices = /^services:\s*$/.test(line);
      current = null;
      continue;
    }
    if (!inServices) continue;
    const name = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)?.[1];
    if (name) {
      current = name;
      blocks.set(name, []);
    } else if (current) {
      blocks.get(current)?.push(line);
    }
  }
  return new Map([...blocks].map(([name, lines]) => [name, lines.join('\n')]));
}

const blocks = services(text);
const EXPECTED = ['postgres', 'redis', 's3', 'clamav', 'mailpit'];

describe('compose.dev.yml', () => {
  it('existe et déclare les cinq services de développement', () => {
    expect(existsSync(COMPOSE)).toBe(true);
    expect([...blocks.keys()].sort()).toEqual([...EXPECTED].sort());
  });

  it('épingle chaque image sur une version précise, jamais latest (EX-T12)', () => {
    for (const [name, block] of blocks) {
      const image = /^\s+image:\s*(\S+)\s*$/m.exec(block)?.[1] ?? '';
      expect(image, name).toMatch(/^[\w./-]+:v?\d+(\.\d+)+[\w.-]*$/);
      expect(image, name).not.toMatch(/:latest$/);
    }
  });

  it('utilise exactement les versions d’images inscrites dans DEPENDENCIES.md (R12)', () => {
    const registry = readFileSync(new URL('../DEPENDENCIES.md', import.meta.url), 'utf8');
    for (const [name, block] of blocks) {
      const [image = '', tag = ''] = (/^\s+image:\s*(\S+)\s*$/m.exec(block)?.[1] ?? '').split(':');
      const row = new RegExp(
        String.raw`^\| \x60${image.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\x60 \| (\S+)`,
        'm',
      );
      expect(row.exec(registry)?.[1], `${name} (${image})`).toBe(tag);
    }
  });

  it('dote chaque service d’un healthcheck (EX-002)', () => {
    for (const [name, block] of blocks) expect(block, name).toMatch(/^\s+healthcheck:\s*$/m);
  });

  it('ne publie aucun port hors de la machine locale (EX-T17)', () => {
    const ports = [...text.matchAll(/^\s+- ["']?([^"'\n]+:\d+)["']?\s*$/gm)]
      .map((m) => m[1] ?? '')
      .filter((value) => /:\d+$/.test(value) && !value.startsWith('/') && !value.startsWith('oz-'));
    expect(ports.length).toBeGreaterThan(0);
    expect(ports.filter((value) => !value.startsWith('127.0.0.1:'))).toEqual([]);
  });

  it('stocke les données dans des volumes nommés', () => {
    for (const name of ['postgres', 'redis', 's3', 'clamav', 'mailpit']) {
      expect(blocks.get(name), name).toMatch(/^\s+- oz-[a-z0-9-]+:\//m);
    }
    expect(text).toMatch(/^volumes:\s*$/m);
  });

  it('ne contient aucun identifiant en clair : tout vient de .env (EX-T08)', () => {
    expect(text).not.toMatch(/(PASSWORD|SECRET|ACCESS_KEY)\s*[:=]\s*["']?[A-Za-z0-9-]{2,}/);
    expect(text).toMatch(/\$\{POSTGRES_PASSWORD/);
  });
});
