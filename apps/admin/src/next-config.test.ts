// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../next.config.js';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('next.config (apps/admin)', () => {
  it('produit un serveur autonome, sans X-Powered-By, en mode strict', () => {
    expect(config.output).toBe('standalone');
    expect(config.poweredByHeader).toBe(false);
    expect(config.reactStrictMode).toBe(true);
  });

  it('interdit l’indexation sur toutes les adresses, fichiers statiques compris', async () => {
    const rules = (await config.headers?.()) ?? [];
    const all = rules.find((rule) => rule.source === '/:path*');
    expect(all?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
    expect(all?.headers).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' });
  });

  it('sert le build autonome sur le port 3002, télémétrie coupée', () => {
    expect(manifest.scripts.start).toContain('node .next/standalone/apps/admin/server.js');
    expect(manifest.scripts.dev).toContain('--port 3002');
    for (const name of ['build', 'dev', 'start', 'typecheck']) {
      expect(manifest.scripts[name], name).toMatch(/^NEXT_TELEMETRY_DISABLED=1 /);
    }
  });

  it('écoute sur toutes les interfaces quel que soit le HOSTNAME hérité (Docker, D-013)', () => {
    expect(manifest.scripts.start).toMatch(/\bHOSTNAME=0\.0\.0\.0 /);
  });
});
