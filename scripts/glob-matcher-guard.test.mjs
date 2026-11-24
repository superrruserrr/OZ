// Garde de la dette D-136 : la faille de picomatch (GHSA-fc5q-39xc-vjpf, CVE-2026-112366) n'est
// exploitable que si un motif fourni par un utilisateur atteint la bibliothèque. Aucun code d'OZ ne
// doit donc importer picomatch ni micromatch ; l'exception de `.trivyignore` en dépend.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url);
const IMPORT =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:picomatch|micromatch)(?:\/[^'"]*)?['"]/;

const sources = execFileSync('git', ['ls-files', 'apps', 'packages', 'scripts'], { cwd: ROOT })
  .toString()
  .split('\n')
  .filter((path) => /\.(?:[cm]?[jt]sx?)$/.test(path))
  .filter((path) => path !== 'scripts/glob-matcher-guard.test.mjs');

describe('garde D-136 : picomatch et micromatch hors du code d’OZ', () => {
  it('aucun fichier versionné ne les importe', () => {
    const offenders = sources.filter((path) =>
      IMPORT.test(readFileSync(new URL(path, ROOT), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('la garde reconnaît les trois formes d’import', () => {
    expect(IMPORT.test("import pm from 'picomatch';")).toBe(true);
    expect(IMPORT.test('const mm = require("micromatch")')).toBe(true);
    expect(IMPORT.test("await import('picomatch/posix')")).toBe(true);
    expect(IMPORT.test("import x from 'picomatch-lite';")).toBe(false);
  });

  it('les exceptions Trivy restent bornées aux identifiants accordés (D-136, D-138)', () => {
    const entries = readFileSync(new URL('.trivyignore', ROOT), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(entries).toEqual(['CVE-2026-112366', 'CVE-2026-124709']);
  });
});
