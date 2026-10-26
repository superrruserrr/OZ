// Conventions de packages/contracts (EX-005 n° 1, naming_conventions.md) : structure et nommage.
// Deux contrôles complémentaires, plus fiables qu'une lecture du texte, couvrent le reste :
// - la rigueur des objets (D2) est vérifiée sur les schémas eux-mêmes : packages/contracts/src/strictness.test.ts ;
// - les imports interdits (Node, NestJS, React, Next) sont bloqués par ESLint (eslint.config.mjs).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCHEMA_FILE = /^[a-z0-9]+(-[a-z0-9]+)*\.schema(\.test)?\.ts$/;
const COMMON_FILE = /^[a-z0-9]+(-[a-z0-9]+)*(\.test)?\.ts$/;
const ROOT_FILES = new Set(['index.ts', 'index.test.ts', 'strictness.ts', 'strictness.test.ts']);

/** Violations des conventions pour une liste de fichiers `{ path, content }` (chemins relatifs à src/). */
export function checkContracts(files) {
  const violations = [];
  for (const { path, content } of files) {
    const parts = path.split('/');
    const name = parts.at(-1) ?? '';
    const add = (message) => violations.push(`${path} : ${message}`);

    if (!name.endsWith('.ts')) {
      add('seuls des fichiers .ts sont admis dans packages/contracts/src');
      continue;
    }
    if (parts.length === 1) {
      if (!ROOT_FILES.has(name)) add('hors dossier de ressource (src/<ressource>/)');
    } else {
      const folder = parts[0] ?? '';
      if (parts.length > 2) add('un seul niveau de dossier (src/<ressource>/<fichier>)');
      if (!KEBAB.test(folder)) add(`dossier « ${folder} » non kebab-case`);
      const pattern = folder === 'common' ? COMMON_FILE : SCHEMA_FILE;
      if (!pattern.test(name)) {
        add(
          folder === 'common'
            ? 'nom non kebab-case'
            : 'nom attendu : <action>.schema.ts, en kebab-case',
        );
      }
    }

    if (/\.schema\.ts$/.test(name)) {
      const consts = [...content.matchAll(/export\s+const\s+(\w+)/g)].map((m) => m[1]);
      const types = [...content.matchAll(/export\s+type\s+(\w+)/g)].map((m) => m[1]);
      const others = [
        ...content.matchAll(
          /export\s+(?:default\b|(?:async\s+)?function|let|var|class|interface|enum)\s*(\w*)/g,
        ),
      ].map((m) => m[0]);
      if (!consts.some((c) => c.endsWith('Schema'))) add('aucun schéma exporté suffixé « Schema »');
      // Seuls les schémas (suffixe Schema) et les listes de valeurs constantes (MAJUSCULES) sont exportés.
      for (const c of consts) {
        if (!c.endsWith('Schema') && !/^[A-Z][A-Z0-9_]*$/.test(c)) {
          add(`export « ${c} » non suffixé « Schema »`);
        }
      }
      if (!types.some((t) => t.endsWith('Input'))) add('aucun type inféré suffixé « Input »');
      for (const t of types) {
        if (!/(Input|Output)$/.test(t)) add(`type « ${t} » non suffixé « Input » ou « Output »`);
      }
      for (const other of others) {
        add(
          `export interdit dans un fichier de schéma : « ${other} » (const Schema ou type Input seulement)`,
        );
      }
    }
  }
  return violations;
}

/** Fichiers de packages/contracts/src (tous types), chemins relatifs avec « / ». */
export function readContractFiles() {
  const root = fileURLToPath(new URL('../packages/contracts/src', import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else {
        files.push({
          path: relative(root, full).split(sep).join('/'),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(root);
  return files;
}
