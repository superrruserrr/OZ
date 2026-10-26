// R12 : toute dépendance externe doit figurer dans DEPENDENCIES.md.
// La source de vérité est ce que pnpm a réellement résolu (lockfile), pas la lecture des manifestes :
// alias, catalogues et overrides sont donc vus tels qu'installés.
// Le contrôle échoue fermé : un cas non pris en charge produit une erreur, jamais un succès silencieux.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Seul registre accepté. Un miroir (.npmrc) fera échouer le contrôle : l'ajouter ici après revue.
const REGISTRY_URL = 'https://registry.npmjs.org/';
const RESOLVED_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const CANONICAL_HEADER = [
  'Paquet',
  'Version',
  'Licence',
  'Poids (décompressé)',
  'Rôle',
  'Alternative native envisagée',
  'Ajouté',
];
const REQUIRED_CELLS = ['Version', 'Licence', 'Poids (décompressé)', 'Rôle'];
const EXCLUDED_HEADING = /écart|rejet|refus|retir|abandon/i;
// Clés de premier niveau du lockfile que ce contrôle sait interpréter. Toute autre clé
// (packageExtensionsChecksum, patchedDependencies, pnpmfileChecksum…) le fait échouer.
const SUPPORTED_LOCKFILE_KEYS = new Set([
  'lockfileVersion',
  'settings',
  'catalogs',
  'overrides',
  'importers',
  'packages',
  'snapshots',
]);

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** Nom d'un paquet dans une spécification `npm:nom@version`, ou `null` si ce n'est pas un alias. */
function aliasTarget(spec) {
  if (typeof spec !== 'string' || !spec.startsWith('npm:')) return null;
  const target = spec.slice(4);
  const at = target.lastIndexOf('@');
  return at > 0 ? target.slice(0, at) : target;
}

/**
 * Paquets consignés : lignes complètes du tableau canonique (sept colonnes, cellules obligatoires
 * renseignées), hors commentaires HTML, blocs de code et sections écartées ou retirées.
 */
export function parseRegistry(markdown) {
  const names = new Set();
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  let heading = '';
  let inFence = false;
  let table = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      table = null;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s/.test(line)) {
      heading = line;
      table = null;
      continue;
    }
    if (!line.trim().startsWith('|')) {
      table = null;
      continue;
    }
    if (table === null) {
      const columns = cells(line);
      const separator = lines[i + 1] ?? '';
      const canonical =
        columns.length === CANONICAL_HEADER.length &&
        columns.every((column, index) => column === CANONICAL_HEADER[index]);
      if (/^\s*\|?\s*:?-{3,}/.test(separator)) {
        table = { canonical: canonical && !EXCLUDED_HEADING.test(heading) };
        i++; // ligne de séparation
      }
      continue;
    }
    if (!table.canonical) continue;
    const row = cells(line);
    const name = /^`([^`]+)`$/.exec(row[0] ?? '')?.[1];
    const complete =
      row.length === CANONICAL_HEADER.length &&
      REQUIRED_CELLS.every((column) => {
        const value = row[CANONICAL_HEADER.indexOf(column)] ?? '';
        return value !== '' && value !== '?' && value !== '—';
      });
    if (name && complete) names.add(name);
  }
  return names;
}

/**
 * Dépendances directes telles que résolues par pnpm (`pnpm ls -r --json --depth 0 --lockfile-only`).
 * Le nom retenu est celui du paquet réellement installé (`from`). Seuls le registre npm et les liens
 * vers un projet du workspace sont acceptés.
 */
export function resolvedDirectDependencies(projects) {
  const workspacePaths = new Set(projects.map((project) => resolve(project.path)));
  const names = new Set();
  const errors = [];

  for (const project of projects) {
    for (const field of RESOLVED_FIELDS) {
      for (const [declared, dep] of Object.entries(project[field] ?? {})) {
        const where = `${project.name} → ${declared}`;
        if (typeof dep.version === 'string' && dep.version.startsWith('link:')) {
          const target = resolve(project.path, dep.version.slice('link:'.length));
          if (!workspacePaths.has(target)) {
            errors.push(`${where} : lien local hors du workspace (${dep.version})`);
          }
          continue;
        }
        if (typeof dep.resolved !== 'string' || !dep.resolved.startsWith(REGISTRY_URL)) {
          errors.push(
            `${where} : source hors du registre npm (${dep.resolved ?? dep.version ?? 'inconnue'})`,
          );
          continue;
        }
        names.add(dep.from ?? declared);
      }
    }
  }
  return { names: [...names].sort(), errors };
}

/** Nom du paquet visé par une clé d'override (`a>b`, `nom@plage`, `@scope/nom@plage`). */
function overrideKeyName(key) {
  const last = key.split('>').pop() ?? key;
  const at = last.indexOf('@', last.startsWith('@') ? 1 : 0);
  return at > 0 ? last.slice(0, at) : last;
}

/**
 * Réglages pnpm enregistrés dans le lockfile (tous les documents YAML).
 * Retourne les paquets concernés par des overrides ; lève une erreur pour tout réglage inconnu.
 */
export function parseLockfileSettings(lockfileText) {
  const overrideNames = new Set();
  let block = null;

  for (const line of lockfileText.split('\n')) {
    if (line === '---' || line.trim() === '') {
      if (line === '---') block = null;
      continue;
    }
    const topLevel = /^([A-Za-z][\w-]*):/.exec(line);
    if (topLevel?.[1]) {
      const key = topLevel[1];
      if (!SUPPORTED_LOCKFILE_KEYS.has(key)) {
        throw new Error(
          `réglage pnpm « ${key} » non pris en charge par le contrôle R12 : à valider en revue, puis à intégrer à ce contrôle`,
        );
      }
      block = key;
      continue;
    }
    if (block !== 'overrides') continue;
    const entry = /^ {2}(['"]?)([^'"\s][^'"]*?)\1:\s+(['"]?)([^'"]+)\3\s*$/.exec(line);
    if (!entry?.[2] || !entry[4]) {
      throw new Error(`ligne d'override illisible dans pnpm-lock.yaml : « ${line.trim()} »`);
    }
    overrideNames.add(overrideKeyName(entry[2]));
    const target = aliasTarget(entry[4]);
    if (target) overrideNames.add(target);
  }
  return { overrideNames: [...overrideNames].sort() };
}

/** peerDependencies déclarées (non installées par le paquet qui les déclare, donc lues dans les manifestes). */
export function peerDependencyNames(packageJsons) {
  const names = new Set();
  for (const pkg of packageJsons) {
    for (const [name, spec] of Object.entries(pkg.peerDependencies ?? {})) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) continue;
      names.add(aliasTarget(spec) ?? name);
    }
  }
  return [...names].sort();
}

export function findUnregistered(dependencies, registry) {
  return dependencies.filter((name) => !registry.has(name));
}

function run(root, args) {
  const result = spawnSync('pnpm', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw new Error(`pnpm introuvable : ${result.error.message}`);
  return result;
}

function workspaceManifests(projects) {
  return projects
    .map((project) => join(project.path, 'package.json'))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, 'utf8')));
}

function main() {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const fail = (lines) => {
    console.error('✖ Contrôle des dépendances (règle R12) :');
    for (const line of lines) console.error(`  - ${line}`);
    return 1;
  };

  const registryPath = join(root, 'DEPENDENCIES.md');
  if (!existsSync(registryPath)) return fail(['DEPENDENCIES.md introuvable']);

  // 1. Le lockfile doit refléter exactement les manifestes, sinon la suite vérifierait un état périmé.
  const frozen = run(root, ['install', '--frozen-lockfile', '--lockfile-only', '--offline']);
  if (frozen.status !== 0) {
    const detail = (frozen.stderr || frozen.stdout).trim().split('\n').slice(-5).join(' / ');
    return fail([
      'vérification du lockfile impossible (lockfile désynchronisé des manifestes, ou store pnpm / configuration inaccessible) : lancer `pnpm install`',
      `sortie de pnpm : ${detail || 'aucune'}`,
    ]);
  }

  // 2. Dépendances directes réellement résolues.
  const listed = run(root, ['ls', '-r', '--json', '--depth', '0', '--lockfile-only']);
  if (listed.status !== 0) return fail([`pnpm ls a échoué : ${listed.stderr.trim()}`]);
  const projects = JSON.parse(listed.stdout);
  if (!Array.isArray(projects) || projects.length === 0) {
    return fail(['pnpm ls n’a renvoyé aucun projet']);
  }
  const { names, errors } = resolvedDirectDependencies(projects);

  // 3. Réglages pnpm (overrides) et peerDependencies.
  let settings;
  try {
    settings = parseLockfileSettings(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'));
  } catch (error) {
    return fail([error instanceof Error ? error.message : String(error)]);
  }
  const all = [
    ...new Set([
      ...names,
      ...settings.overrideNames,
      ...peerDependencyNames(workspaceManifests(projects)),
    ]),
  ].sort();

  const registry = parseRegistry(readFileSync(registryPath, 'utf8'));
  const missing = findUnregistered(all, registry).map(
    (name) => `${name} : absent de DEPENDENCIES.md (ligne complète du tableau canonique requise)`,
  );
  if (errors.length > 0 || missing.length > 0) return fail([...errors, ...missing]);

  console.log(
    `✓ ${all.length} dépendances résolues par pnpm, toutes consignées dans DEPENDENCIES.md.`,
  );
  return 0;
}

// Exécution directe : comparaison des chemins réels (liens symboliques, /tmp → /private/tmp).
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
