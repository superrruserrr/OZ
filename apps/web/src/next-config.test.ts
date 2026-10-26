// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../next.config.js';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('next.config (apps/web)', () => {
  it('produit un serveur autonome déployable par Coolify (lot 0.8)', () => {
    expect(config.output).toBe('standalone');
  });

  it('ne révèle pas le framework (X-Powered-By)', () => {
    expect(config.poweredByHeader).toBe(false);
  });

  it('active le mode strict de React et compile les paquets OZ', () => {
    expect(config.reactStrictMode).toBe(true);
    expect(config.transpilePackages).toEqual(expect.arrayContaining(['@oz/ui', '@oz/contracts']));
  });

  it('coupe la télémétrie Next dans chaque script qui lance next ou le serveur autonome', () => {
    const nextScripts = Object.entries(manifest.scripts).filter(([, cmd]) =>
      /\bnext\b|server\.js/.test(cmd),
    );
    expect(nextScripts.map(([name]) => name).sort()).toEqual([
      'build',
      'dev',
      'start',
      'typecheck',
    ]);
    for (const [name, cmd] of nextScripts) expect(cmd, name).toMatch(/^NEXT_TELEMETRY_DISABLED=1 /);
  });

  it('sert le build autonome réellement déployé, pas `next start`', () => {
    expect(manifest.scripts.start).toContain('node .next/standalone/apps/web/server.js');
    expect(manifest.scripts.build).toContain('next-standalone-assets.mjs');
  });

  it('écoute sur toutes les interfaces quel que soit le HOSTNAME hérité (Docker, D-013)', () => {
    expect(manifest.scripts.start).toMatch(/\bHOSTNAME=0\.0\.0\.0 /);
  });
});
