// .github/dependabot.yml : les montées majeures tranchées dans DEBT.md ne doivent pas revenir
// en PR automatique (D-001 Node 24, D-002 TypeScript 6, D-005 PostgreSQL aligné sur Scaleway,
// Redis : licence et alternative Valkey à évaluer au lot 0.8).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');

/** Bloc d'un écosystème : de son `- package-ecosystem:` au suivant. */
function ecosystem(name) {
  const blocks = text.split(/^ {2}- package-ecosystem:\s*/m).slice(1);
  // Nom exact : `docker` ne doit pas désigner le bloc `docker-compose`.
  return blocks.find((block) => block.split('\n')[0]?.trim() === name) ?? '';
}

/** Vrai si le bloc ignore les montées majeures de la dépendance. */
function ignoresMajor(block, dependency) {
  const entries = block.split(/^ {6}- dependency-name:\s*/m).slice(1);
  return entries.some((entry) => {
    const [first = ''] = entry.split('\n');
    return (
      first.trim().replace(/^['"]|['"]$/g, '') === dependency &&
      /update-types:\s*\[\s*['"]version-update:semver-major['"]\s*\]/.test(entry)
    );
  });
}

describe('dependabot.yml', () => {
  it.each([
    ['npm', 'typescript'],
    ['npm', '@types/node'],
    ['docker-compose', 'postgres'],
    ['docker-compose', 'redis'],
    // Node 24 LTS (.nvmrc) : une majeure impaire (non LTS) cassait la construction des images (#19).
    ['docker', 'node'],
  ])('%s : ignore les montées majeures de %s', (name, dependency) => {
    expect(ignoresMajor(ecosystem(name), dependency)).toBe(true);
  });

  it.each(['npm', 'github-actions', 'docker-compose'])(
    '%s : attend au moins 14 jours après une publication (cooldown, chaîne d’approvisionnement)',
    (name) => {
      const days = /cooldown:\s*\n\s+default-days:\s*(\d+)/.exec(ecosystem(name))?.[1];
      expect(Number(days)).toBeGreaterThanOrEqual(14);
    },
  );

  it('ne fusionne jamais automatiquement (R14)', () => {
    expect(text).not.toMatch(/auto-?merge:\s*true/i);
  });
});
