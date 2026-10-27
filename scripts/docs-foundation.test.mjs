// Documents fondateurs exigés par EX-011 (lot 0.11) : présence, modèle d'ADR (Annexe A du plan),
// modèle de PR (Annexe B), modèle de menaces (§6.1), liens relatifs valides.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : '');

const ADR_DIR = 'docs/adr';
const adrFiles = existsSync(join(ROOT, ADR_DIR))
  ? readdirSync(join(ROOT, ADR_DIR)).filter((name) => /^ADR-\d{3}-[a-z0-9-]+\.md$/.test(name))
  : [];

const REQUIRED = [
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.github/pull_request_template.md',
  'docs/security/policy.md',
  'docs/security/threats.md',
  'docs/PLAN.md',
];

describe('ADR 001 à 008 (Annexe A)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('ADR-00%i : un seul fichier, conforme au modèle', (n) => {
    const id = `ADR-${String(n).padStart(3, '0')}`;
    const files = adrFiles.filter((name) => name.startsWith(`${id}-`));
    expect(files).toHaveLength(1);
    const text = read(`${ADR_DIR}/${files[0] ?? ''}`);
    expect(text).toMatch(new RegExp(`^# ${id} : \\S`, 'm'));
    expect(text).toMatch(/^Statut : (Proposé|Accepté|Remplacé par ADR-\d{3})\s*$/m);
    expect(text).toMatch(/^Date : \d{4}-\d{2}-\d{2} · Décideurs : \S/m);
    for (const section of ['Contexte', 'Options envisagées', 'Décision', 'Conséquences']) {
      expect(text).toMatch(new RegExp(`^## ${section}\\s*$`, 'm'));
    }
  });

  it("l'index docs/adr/README.md liste chaque ADR avec son statut", () => {
    const index = read(`${ADR_DIR}/README.md`);
    for (const name of adrFiles) {
      const status = /^Statut : (.+?)\s*$/m.exec(read(`${ADR_DIR}/${name}`))?.[1] ?? '';
      const row = index.split('\n').find((line) => line.includes(`](${name})`)) ?? '';
      expect(row, name).not.toBe('');
      expect(row, name).toContain(status);
    }
  });
});

describe('documents exigés (EX-011)', () => {
  it.each(REQUIRED)('%s existe et n’est pas vide', (path) => {
    expect(read(path).trim().length).toBeGreaterThan(200);
  });

  it('le modèle de PR reprend les neuf cases de la Definition of Done (Annexe B)', () => {
    const template = read('.github/pull_request_template.md');
    for (const item of [
      "Tests unitaires et d'intégration écrits et verts",
      'Seuils de couverture atteints',
      'Test « rôle non autorisé » présent si nouvel endpoint',
      'Schéma OpenAPI à jour',
      'Migration réversible testée (up + down)',
      'Aucune donnée personnelle dans les logs',
      'Aucun secret, aucun TODO, aucun `any` non justifié',
      'Déployé et fumé en prévisualisation',
      'CHANGELOG mis à jour',
    ]) {
      expect(template).toContain(`- [ ] ${item}`);
    }
  });

  it('le modèle de menaces couvre les huit risques du §6.1, dans l’ordre', () => {
    const threats = read('docs/security/threats.md');
    const risks = [
      "Fraude à l'âge et à l'identité",
      'Fuite de données de mineurs',
      'Comptes recruteurs frauduleux',
      'Certification frauduleuse de performances',
      'Inscription massive automatisée',
      'Escalade de privilèges',
      'Téléversement malveillant',
      'Aspiration de la base par un concurrent',
    ];
    const positions = risks.map((risk, i) => threats.indexOf(`## ${i + 1}. ${risk}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('liens et références', () => {
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((path) => path && existsSync(join(ROOT, path)));

  it('aucun fichier versionné ne cite l’ancien chemin du plan (docs/PLAN.md, D1)', () => {
    const offenders = tracked
      .filter((path) => /\.(md|mjs|ts|tsx|json|ya?ml)$/.test(path))
      .filter((path) => path !== 'scripts/docs-foundation.test.mjs')
      // Plan de lot de travail, jamais versionné (supprimé par /commit-phase).
      .filter((path) => !/^phase[\d.]+[a-z]?_plan\.md$/.test(path))
      .filter((path) => read(path).includes('OZ_Plan_Execution_Technique.md'));
    expect(offenders).toEqual([]);
  });

  it('les liens relatifs des documents fondateurs pointent vers des fichiers existants', () => {
    const documents = [...REQUIRED, `${ADR_DIR}/README.md`, 'docs/security/README.md']
      .concat(adrFiles.map((name) => `${ADR_DIR}/${name}`))
      .filter((path) => path !== 'docs/PLAN.md');
    const broken = [];
    for (const path of documents) {
      for (const [, target] of read(path).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const file = target.split('#')[0];
        if (!existsSync(join(ROOT, dirname(path), file))) broken.push(`${path} → ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
