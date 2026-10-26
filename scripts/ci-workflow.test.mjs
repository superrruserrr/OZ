// .github/workflows/ci.yml : contrôles exigés (EX-T03) et durcissement de la chaîne d'approvisionnement.
// Lecture textuelle (structure YAML simple et maîtrisée), comme scripts/compose-dev.test.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WORKFLOW = new URL('../.github/workflows/ci.yml', import.meta.url);
const text = existsSync(WORKFLOW) ? readFileSync(WORKFLOW, 'utf8') : '';

/** Blocs de jobs : clé à deux espaces sous `jobs:`. */
function jobs(yaml) {
  const blocks = new Map();
  let inJobs = false;
  let current = null;
  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) {
      inJobs = /^jobs:\s*$/.test(line);
      current = null;
      continue;
    }
    if (!inJobs) continue;
    const name = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)?.[1];
    if (name) {
      current = name;
      blocks.set(name, []);
    } else if (current) blocks.get(current)?.push(line);
  }
  return new Map([...blocks].map(([name, lines]) => [name, lines.join('\n')]));
}

const blocks = jobs(text);

/** Noms affichés des contrôles exigés par la protection de branches (.github/rulesets). */
export const REQUIRED_JOBS = [
  'quality',
  'test',
  'build-e2e',
  'security',
  'migrations',
  'containers',
];

describe('ci.yml — contrôles exigés (EX-T03)', () => {
  it('existe et déclare exactement les jobs exigés', () => {
    expect(existsSync(WORKFLOW)).toBe(true);
    expect([...blocks.keys()].sort()).toEqual([...REQUIRED_JOBS].sort());
  });

  it('se déclenche sur les PR et les poussées vers develop et main, jamais sur pull_request_target', () => {
    expect(text).toMatch(/^on:\s*$/m);
    expect(text).toMatch(/^ {2}pull_request:\s*$/m);
    expect(text).toMatch(/^ {2}push:\s*\n {4}branches: \[develop, main\]\s*$/m);
    expect(text).not.toMatch(/pull_request_target/);
  });

  it('installe avec le lockfile figé et lit Node dans .nvmrc', () => {
    expect(text).toContain('pnpm install --frozen-lockfile');
    expect(text).toMatch(/node-version-file: \.nvmrc/);
    expect(text).not.toMatch(/node-version:\s*['"]?\d/);
  });

  it('construit les types (typecheck) avant le lint typé : un clone neuf n’a ni dist ni client Prisma', () => {
    const quality = blocks.get('quality') ?? '';
    expect(quality.indexOf('pnpm typecheck')).toBeGreaterThan(-1);
    expect(quality.indexOf('pnpm typecheck')).toBeLessThan(quality.indexOf('pnpm lint'));
  });

  it('vérifie le titre de la PR, qui devient le message du commit squashé', () => {
    const quality = blocks.get('quality') ?? '';
    expect(quality).toMatch(/PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/);
    expect(quality).toMatch(/printf '%s\\n' "\$PR_TITLE" \| pnpm exec commitlint/);
  });

  it('exécute format, lint, commitlint et typecheck dans quality', () => {
    const quality = blocks.get('quality') ?? '';
    for (const command of ['pnpm format:check', 'pnpm lint', 'pnpm typecheck', 'commitlint']) {
      expect(quality, command).toContain(command);
    }
  });

  it('met en cache le store pnpm et Turbo (EX-007.3)', () => {
    expect(text).toMatch(/cache: pnpm/);
    expect(blocks.get('quality') ?? '').toMatch(/path: \.turbo/);
  });
});

describe('ci.yml — durcissement', () => {
  it('épingle chaque action tierce par empreinte de commit, version en commentaire', () => {
    const uses = [...text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const [, ref, rest] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/#\s*v\d+\.\d+\.\d+/);
    }
  });

  it('n’accorde que la lecture du contenu par défaut, sans permission en écriture', () => {
    expect(text).toMatch(/^permissions:\s*\n {2}contents: read\s*$/m);
    expect(text).not.toMatch(/:\s*write\b/);
  });

  it('annule les exécutions dépassées d’une PR, jamais celles de develop ou main', () => {
    expect(text).toMatch(
      /^concurrency:\s*\n {2}group: .+\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/m,
    );
  });

  it('n’active le cache pnpm que dans les jobs qui installent les dépendances', () => {
    for (const [name, block] of blocks) {
      if (block.includes('cache: pnpm'))
        expect(block, name).toContain('pnpm install --frozen-lockfile');
    }
  });

  it('ne met pas en cache Turbo les builds .next (cache volumineux et sans limite)', () => {
    expect(blocks.get('build-e2e') ?? '').not.toMatch(/path: \.turbo/);
  });

  it('borne la durée de chaque job et ne conserve pas les identifiants Git', () => {
    for (const [name, block] of blocks) {
      expect(block, name).toMatch(/^ {4}timeout-minutes: \d+\s*$/m);
    }
    const checkouts = text.match(/uses: actions\/checkout@/g)?.length ?? 0;
    const hardened = text.match(/persist-credentials: false/g)?.length ?? 0;
    expect(checkouts).toBeGreaterThan(0);
    expect(hardened).toBe(checkouts);
  });

  it('coupe la télémétrie de Next et de Turbo', () => {
    expect(text).toMatch(/NEXT_TELEMETRY_DISABLED: '1'/);
    expect(text).toMatch(/TURBO_TELEMETRY_DISABLED: '1'/);
  });
});

describe('ci.yml — contenu des jobs', () => {
  it('test : couverture avec seuils (R6) après compilation des paquets partagés', () => {
    const test = blocks.get('test') ?? '';
    expect(test).toContain("pnpm exec turbo run build --filter='./packages/*'");
    expect(test).toContain('pnpm test:coverage');
  });

  it('build-e2e : build complet puis fumée Playwright sur Chromium', () => {
    const job = blocks.get('build-e2e') ?? '';
    expect(job).toContain('pnpm build');
    expect(job).toContain('pnpm exec playwright install --with-deps chromium');
    expect(job).toContain('pnpm test:e2e');
  });

  it('security : gitleaks sur tout l’historique, audit, Trivy et Semgrep épinglé', () => {
    const job = blocks.get('security') ?? '';
    expect(job).toMatch(/fetch-depth: 0/);
    expect(job).toContain('scripts/install-ci-tools.sh');
    // Historique de la branche analysée (HEAD), pas toutes les branches récupérées.
    expect(job).toMatch(/gitleaks" git --no-banner --redact \.'/);
    expect(job).not.toMatch(/--log-opts/);
    expect(job).toContain('pnpm audit --audit-level=high');
    expect(job).toContain('trivy" fs --config trivy.yaml');
    expect(job).toMatch(/semgrep\/semgrep@sha256:[0-9a-f]{64}/);
    // Bloque dès WARNING (MEDIUM des règles récentes) : les règles gratuites classent peu d'alertes en ERROR.
    for (const severity of ['WARNING', 'ERROR']) {
      expect(job).toContain(`--severity=${severity}`);
    }
    for (const pack of [
      'p/typescript',
      'p/javascript',
      'p/nodejs',
      'p/react',
      'p/nextjs',
      'p/expressjs',
      'p/owasp-top-ten',
      'p/secrets',
    ]) {
      expect(job).toContain(`--config=${pack}`);
    }
  });

  it('containers : images construites, Trivy bloquant sur chacune, fumée sur les conteneurs', () => {
    const job = blocks.get('containers') ?? '';
    expect(job).toContain('docker compose -f infra/docker/compose.smoke.yml build');
    for (const image of ['oz-api:smoke', 'oz-web:smoke', 'oz-admin:smoke']) {
      // Configuration dédiée : trivy.yaml (racine) exclut node_modules, qui serait ignoré dans l'image.
      expect(job, image).toContain(`trivy" image --config trivy-image.yaml ${image}'`);
    }
    expect(job).toContain('pnpm exec playwright install --with-deps chromium');
    expect(job).toContain('pnpm test:containers');
  });

  it('migrations : PostgreSQL 16.15 du compose, script vérifié, APP_ENV explicite', () => {
    const job = blocks.get('migrations') ?? '';
    const compose = readFileSync(
      new URL('../infra/docker/compose.dev.yml', import.meta.url),
      'utf8',
    );
    const image = /image: (postgres:\S+)/.exec(compose)?.[1];
    expect(job).toContain(`image: ${image ?? '?'}`);
    expect(job).toContain('APP_ENV: local');
    expect(job).toContain('scripts/ci-migrations.sh');
  });
});

describe('outils de sécurité installés par la CI', () => {
  const script = existsSync(new URL('./install-ci-tools.sh', import.meta.url))
    ? readFileSync(new URL('./install-ci-tools.sh', import.meta.url), 'utf8')
    : '';

  it('vérifie chaque archive par une empreinte SHA-256 figée', () => {
    expect(script).toMatch(/sha256sum --check --strict/);
    const installs = [
      ...script.matchAll(/^install_tool (\w+) \\\n\s+(https:\S+) \\\n\s+([0-9a-f]{64})$/gm),
    ];
    expect(installs.map(([, name]) => name).sort()).toEqual(['gitleaks', 'trivy']);
    for (const [, , url] of installs)
      expect(url).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w-]+\/releases\/download\//);
  });

  it('Trivy bloque sur HIGH et CRITICAL : vulnérabilités, mauvaises configurations, secrets', () => {
    const trivy = readFileSync(new URL('../trivy.yaml', import.meta.url), 'utf8');
    expect(trivy).toMatch(/exit-code: 1/);
    expect(trivy).toMatch(/severity:\s*\n\s+- HIGH\s*\n\s+- CRITICAL/);
    expect(trivy).toMatch(/scanners:\s*\n\s+- vuln\s*\n\s+- misconfig\s*\n\s+- secret/);
  });

  it('gitleaks n’exclut plus les dossiers .next (D-018)', () => {
    expect(readFileSync(new URL('../.gitleaks.toml', import.meta.url), 'utf8')).not.toMatch(
      /\.next/,
    );
  });
});

describe('protection de branches versionnée (.github/rulesets, EX-T03.1)', () => {
  const ruleset = (name) => {
    const url = new URL(`../.github/rulesets/${name}.json`, import.meta.url);
    return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : {};
  };
  const rule = (set, type) => (set.rules ?? []).find((r) => r.type === type);

  it.each(['develop', 'main'])('%s : règles actives, sans contournement', (name) => {
    const set = ruleset(name);
    expect(set.target).toBe('branch');
    expect(set.enforcement).toBe('active');
    expect(set.bypass_actors).toEqual([]);
    expect(set.conditions?.ref_name?.include).toEqual([`refs/heads/${name}`]);
  });

  it.each(['develop', 'main'])(
    '%s : exige les six contrôles de la CI, à jour avec la base',
    (name) => {
      const checks = rule(ruleset(name), 'required_status_checks')?.parameters;
      expect(checks?.strict_required_status_checks_policy).toBe(true);
      expect(checks?.required_status_checks.map((c) => c.context).sort()).toEqual(
        [...REQUIRED_JOBS].sort(),
      );
    },
  );

  it.each(['develop', 'main'])(
    '%s : PR obligatoire, discussions résolues, aucune approbation exigée, ni suppression ni poussée forcée',
    (name) => {
      const set = ruleset(name);
      const pr = rule(set, 'pull_request')?.parameters;
      expect(pr?.required_review_thread_resolution).toBe(true);
      // TD-018 : développeur seul, GitHub refuse l'auto-approbation ; R14 adapté (revue adversariale
      // + merge par Gaëtan Wassu). Une approbation exigée bloquerait tout merge.
      expect(pr?.required_approving_review_count).toBe(0);
      for (const type of ['deletion', 'non_fast_forward'])
        expect(rule(set, type), type).toBeDefined();
    },
  );

  it('develop : squash seul et historique linéaire (§2.3)', () => {
    const set = ruleset('develop');
    expect(rule(set, 'pull_request')?.parameters.allowed_merge_methods).toEqual(['squash']);
    expect(rule(set, 'required_linear_history')).toBeDefined();
  });

  it('main : merge commit de release/hotfix, sans historique linéaire imposé (TD-018)', () => {
    const set = ruleset('main');
    // Un squash vers main créerait un commit absent de develop : conflits à la release suivante.
    expect(rule(set, 'pull_request')?.parameters.allowed_merge_methods).toEqual(['merge']);
    expect(rule(set, 'required_linear_history')).toBeUndefined();
  });

  it('n’admet vers main que des branches release/* et hotfix/* (§2.3, contrôle de la CI)', () => {
    const quality = blocks.get('quality') ?? '';
    expect(quality).toMatch(/github\.base_ref == 'main'/);
    expect(quality).toMatch(/release\/\*\|hotfix\/\*/);
  });
});
