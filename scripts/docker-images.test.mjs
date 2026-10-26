// Images de conteneur (lot 0.8a) : contexte de build sans secret, bases épinglées, exécution non-root.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const IMAGES_DIR = new URL('../infra/docker/images/', import.meta.url);
const dockerfiles = existsSync(IMAGES_DIR)
  ? readdirSync(IMAGES_DIR).filter((name) => name.endsWith('.Dockerfile'))
  : [];

describe('.dockerignore', () => {
  const rules = read('.dockerignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  it.each([
    '.git',
    '**/node_modules',
    '**/.next',
    '**/dist',
    'coverage',
    '**/.env',
    '**/.env.*',
    'OZ_Document_de_Projet.pdf',
    'EX CHART',
    '**/test-results',
  ])('exclut %s du contexte de build', (rule) => {
    expect(rules).toContain(rule);
  });

  it('ne réintègre que .env.example', () => {
    expect(rules.filter((rule) => rule.startsWith('!'))).toEqual(['!.env.example']);
  });

  it('exclut aussi les .env imbriqués (apps/web/.env.local, lu par next build)', () => {
    expect(rules).not.toContain('.env');
    expect(rules).toContain('**/.env.*');
  });
});

describe('Dependabot : images de base', () => {
  it('met à jour les images de infra/docker/images, avec délai et sans auto-merge', () => {
    const config = read('.github/dependabot.yml');
    const block = config
      .split(/^ {2}- package-ecosystem:\s*/m)
      .find((b) => b.startsWith('docker\n'));
    expect(block).toBeDefined();
    expect(block).toMatch(/directory: \/infra\/docker\/images/);
    expect(block).toMatch(/cooldown:\s*\n\s+default-days: 14/);
  });
});

describe.each(dockerfiles)('%s', (name) => {
  // Lignes de continuation (`\` en fin de ligne) jointes : une instruction par ligne.
  const text = readFileSync(new URL(name, IMAGES_DIR), 'utf8').replace(/\\\n\s*/g, ' ');

  it('épingle chaque image de base par condensé, version en commentaire', () => {
    const froms = [...text.matchAll(/^FROM\s+(\S+)(.*)$/gm)];
    expect(froms.length).toBeGreaterThan(1);
    for (const [, image, rest] of froms) {
      if (/^[a-z]+$/.test(image)) continue; // étape précédente (FROM build AS …)
      expect(image, image).toMatch(/@sha256:[0-9a-f]{64}$/);
      expect(rest, image).toMatch(/AS \w+|#/);
    }
  });

  it('s’exécute sur distroless nodejs24, en utilisateur non-root 65532', () => {
    const final = text.slice(text.lastIndexOf('\nFROM '));
    expect(final).toMatch(/gcr\.io\/distroless\/nodejs24-debian13@sha256:/);
    expect(final).toMatch(/^USER 65532:65532$/m);
  });

  it('déclare un contrôle de santé en Node, sans shell', () => {
    expect(text).toMatch(
      /^HEALTHCHECK .*CMD \["\/nodejs\/bin\/node", "(\/app\/)?healthcheck\.mjs"/m,
    );
  });

  it('laisse le code en lecture seule pour l’utilisateur d’exécution (root propriétaire)', () => {
    const final = text.slice(text.lastIndexOf('\nFROM '));
    // L'image nonroot tourne déjà en 65532 : root explicite avant WORKDIR/COPY, sinon /app lui appartient.
    expect(final.indexOf('USER 0:0')).toBeGreaterThan(-1);
    expect(final.indexOf('USER 0:0')).toBeLessThan(final.indexOf('COPY'));
    for (const copy of final.match(/^COPY .*$/gm) ?? []) {
      // Seul le cache de Next (créé à l'exécution) appartient à l'utilisateur 65532.
      if (/--chown=65532/.test(copy))
        expect(copy).toMatch(/\/writable\/ \/app\/apps\/\$\{APP\}\/\.next\/$/);
    }
  });

  it('ne transporte aucun secret au build', () => {
    expect(text).not.toMatch(/^(ARG|ENV)\s+\S*(SECRET|PASSWORD|TOKEN|KEY)\S*/im);
    expect(text).not.toMatch(/\.env\b(?!\.example)/);
  });
});

describe('next.Dockerfile : adresse d’écoute indépendante de HOSTNAME (D-013)', () => {
  const text = readFileSync(new URL('next.Dockerfile', IMAGES_DIR), 'utf8');
  const launcher = existsSync(new URL('next-start.mjs', IMAGES_DIR))
    ? readFileSync(new URL('next-start.mjs', IMAGES_DIR), 'utf8')
    : '';

  it('démarre par un lanceur qui impose 0.0.0.0, même si l’orchestrateur définit HOSTNAME', () => {
    expect(text).toMatch(/^CMD \["\/app\/next-start\.mjs"\]$/m);
    expect(launcher).toMatch(/process\.env\.HOSTNAME = '0\.0\.0\.0';/);
    expect(launcher).toMatch(/await import\(/);
  });
});

describe('trivy-image.yaml (analyse des images)', () => {
  const config = read('trivy-image.yaml');

  it('analyse les dépendances npm des images : aucune exclusion de dossier', () => {
    expect(config).not.toMatch(/skip-dirs|skip-files/);
  });

  it('bloque sur HIGH et CRITICAL, vulnérabilités et secrets', () => {
    expect(config).toMatch(/exit-code: 1/);
    expect(config).toMatch(/severity:\s*\n\s+- HIGH\s*\n\s+- CRITICAL/);
    expect(config).toMatch(/scanners:\s*\n\s+- vuln\s*\n\s+- secret/);
  });
});

describe('paquets du monorepo livrés dans les images', () => {
  it.each(['config', 'contracts'])(
    '@oz/%s ne publie que dist (ni sources ni tests dans les images)',
    (name) => {
      const manifest = JSON.parse(read(`packages/${name}/package.json`));
      expect(manifest.files).toEqual(['dist']);
    },
  );
});

describe('reproductibilité de la construction', () => {
  it('épingle pnpm par empreinte SHA-512 (corepack le vérifie au build)', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.packageManager).toMatch(/^pnpm@12\.15\.0\+sha512\.[0-9a-f]{128}$/);
  });

  it('affiche les journaux des conteneurs quand la fumée échoue (diagnostic en CI)', () => {
    const script = read('scripts/containers-smoke.sh');
    expect(script).toMatch(/logs --no-color/);
    expect(script).toMatch(/trap .+ EXIT/);
  });
});
