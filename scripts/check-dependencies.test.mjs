import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  findUnregistered,
  parseLockfileSettings,
  parseRegistry,
  peerDependencyNames,
  resolvedDirectDependencies,
} from './check-dependencies.mjs';

const HEADER =
  '| Paquet | Version | Licence | Poids (décompressé) | Rôle | Alternative native envisagée | Ajouté |\n|---|---|---|---|---|---|---|';

const registry = `
## Outillage

${HEADER}
| \`eslint\` | 10.13.0 | MIT | 2,8 Mo | Lint | Aucune | 0.1 |
| \`@types/node\` | ^24 | MIT | 2,5 Mo | Types | — | 0.1 |
| \`sans-licence\` | 1.0.0 |  | 1 Ko | Rien | — | 0.1 |
| \`licence-inconnue\` | 1.0.0 | ? | 1 Ko | Rien | — | 0.1 |
| \`incomplet\` | 1.0.0 | MIT |

<!--
| \`commente\` | 1.0.0 | MIT | 1 Ko | Masqué | — | 0.1 |
-->

\`\`\`
| \`dans-un-bloc\` | 1.0.0 | MIT | 1 Ko | Exemple | — | 0.1 |
\`\`\`

| Paquet | Licence |
|---|---|
| \`tableau-minimal\` | MIT |

## Dépendances écartées

${HEADER}
| \`ecarte\` | 1.0.0 | MIT | 1 Ko | Refusé | — | 0.1 |

## Dépendances retirées

${HEADER}
| \`retire\` | 1.0.0 | MIT | 1 Ko | Retiré | — | 0.1 |
`;

describe('parseRegistry (R12)', () => {
  it('ne retient que les lignes complètes du tableau canonique, hors commentaires, blocs de code et sections écartées ou retirées', () => {
    expect(parseRegistry(registry)).toEqual(new Set(['eslint', '@types/node']));
  });
});

const REGISTRY_URL = 'https://registry.npmjs.org/';
const ls = (deps) => [
  { name: '@oz/core', path: '/ws/packages/core', dependencies: deps },
  { name: '@oz/config', path: '/ws/packages/config' },
];

describe('resolvedDirectDependencies (R12) — ce que pnpm a réellement résolu', () => {
  it('retient le nom du paquet réellement installé (alias npm:, catalogue)', () => {
    const { names, errors } = resolvedDirectDependencies(
      ls({
        '@oz/evil': {
          from: 'left-pad',
          version: '1.3.0',
          resolved: `${REGISTRY_URL}left-pad/-/left-pad-1.3.0.tgz`,
        },
      }),
    );
    expect(names).toEqual(['left-pad']);
    expect(errors).toEqual([]);
  });

  it('ignore les liens vers un projet du workspace', () => {
    const { names, errors } = resolvedDirectDependencies(
      ls({ '@oz/config': { from: '@oz/config', version: 'link:../config' } }),
    );
    expect(names).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('refuse un lien local qui n’est pas un projet du workspace', () => {
    const { errors } = resolvedDirectDependencies(
      ls({ eslint: { from: 'eslint', version: 'link:../../../ailleurs' } }),
    );
    expect(errors).toHaveLength(1);
  });

  it('refuse toute source hors du registre npm (git, URL, fichier)', () => {
    const { errors } = resolvedDirectDependencies(
      ls({
        a: {
          from: 'a',
          version: '1.0.0',
          resolved: 'https://codeload.github.com/evil/pad/tar.gz/abc',
        },
        b: { from: 'b', version: 'file:../b.tgz' },
        c: { from: 'c', version: '1.0.0' },
      }),
    );
    expect(errors).toHaveLength(3);
  });
});

const lockfile = (extra) => `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}

packages: {}

---
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

catalogs:
  default:
    typescript:
      specifier: 6.0.3
      version: 6.0.3
${extra}
importers: {}

packages: {}

snapshots: {}
`;

describe('parseLockfileSettings (R12) — réglages pnpm', () => {
  it('lit les overrides, y compris la cible réelle d’un alias npm:', () => {
    const settings = parseLockfileSettings(
      lockfile("\noverrides:\n  is-number: npm:left-pad@1.3.0\n  'semver@<7.5.2': ^7.5.2\n"),
    );
    expect(settings.overrideNames).toEqual(['is-number', 'left-pad', 'semver']);
  });

  it('accepte un lockfile sans réglage particulier', () => {
    expect(parseLockfileSettings(lockfile('')).overrideNames).toEqual([]);
  });

  it('refuse un réglage pnpm non pris en charge (packageExtensions, patches…)', () => {
    expect(() =>
      parseLockfileSettings(lockfile('\npackageExtensionsChecksum: sha256-abc\n')),
    ).toThrow(/packageExtensionsChecksum/);
    expect(() => parseLockfileSettings(lockfile('\npatchedDependencies:\n  x: {}\n'))).toThrow(
      /patchedDependencies/,
    );
  });

  it('lit les dépendances optionnelles écartées (aucune installée, rien à enregistrer)', () => {
    const settings = parseLockfileSettings(
      lockfile("\nignoredOptionalDependencies:\n  - '@napi-rs/canvas'\n  - fsevents\n"),
    );
    expect(settings.ignoredOptionalNames).toEqual(['@napi-rs/canvas', 'fsevents']);
    expect(settings.overrideNames).toEqual([]);
  });

  it('refuse un bloc de dépendances optionnelles écartées qu’il ne sait pas lire', () => {
    expect(() =>
      parseLockfileSettings(lockfile('\nignoredOptionalDependencies:\n  x: 1.0.0\n')),
    ).toThrow(/ignoredOptionalDependencies/);
    expect(() =>
      parseLockfileSettings(lockfile("\nignoredOptionalDependencies:\n  - '@a/*'\n")),
    ).toThrow(/ignoredOptionalDependencies/);
    expect(() =>
      parseLockfileSettings(lockfile("\nignoredOptionalDependencies: ['@a/*']\n")),
    ).toThrow(/ignoredOptionalDependencies/);
  });

  it('refuse un bloc overrides qu’il ne sait pas lire', () => {
    expect(() => parseLockfileSettings(lockfile('\noverrides:\n  a:\n    b: 1.0.0\n'))).toThrow();
  });
});

describe('peerDependencyNames (R12)', () => {
  it('collecte les peerDependencies, alias résolus, hors workspace:', () => {
    expect(
      peerDependencyNames([
        { peerDependencies: { react: '^19', x: 'npm:@scope/y@^1', '@oz/core': 'workspace:*' } },
      ]),
    ).toEqual(['@scope/y', 'react']);
  });
});

describe('findUnregistered (R12)', () => {
  it('signale toute dépendance absente du registre', () => {
    expect(findUnregistered(['eslint', 'zod'], parseRegistry(registry))).toEqual(['zod']);
  });
});

describe('exécution en ligne de commande', () => {
  const script = fileURLToPath(new URL('./check-dependencies.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'oz-check-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('valide le dépôt réel, y compris appelé par un lien symbolique', () => {
    const link = join(dir, 'check-dependencies.mjs');
    symlinkSync(script, link);
    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/✓/);
    expect(result.status).toBe(0);
  }, 60_000);
});
