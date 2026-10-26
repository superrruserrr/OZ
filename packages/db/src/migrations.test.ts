import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { conventionProblems, listMigrations, MIGRATIONS_DIR } from './migrations.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Dossier de migrations factice : { nom: { 'migration.sql': …, 'down.sql': … } }. */
function fixture(migrations: Record<string, Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'oz-migrations-'));
  dirs.push(root);
  writeFileSync(join(root, 'migration_lock.toml'), 'provider = "postgresql"\n');
  for (const [name, files] of Object.entries(migrations)) {
    mkdirSync(join(root, name));
    for (const [file, content] of Object.entries(files))
      writeFileSync(join(root, name, file), content);
  }
  return root;
}

const UP = 'CREATE TABLE t (id int);\n';
const DOWN = 'DROP TABLE t;\n';

describe('convention des migrations (EX-T09.1, R9)', () => {
  it('les migrations du dépôt la respectent', () => {
    expect(conventionProblems(MIGRATIONS_DIR)).toEqual([]);
    expect(listMigrations(MIGRATIONS_DIR).length).toBeGreaterThan(0);
  });

  it('liste les migrations dans l’ordre d’application', () => {
    const dir = fixture({
      '20261027000000_b': { 'migration.sql': UP, 'down.sql': DOWN },
      '20261026000000_a': { 'migration.sql': UP, 'down.sql': DOWN },
    });
    expect(listMigrations(dir).map((m) => m.name)).toEqual([
      '20261026000000_a',
      '20261027000000_b',
    ]);
  });

  it.each([
    ['sans down.sql', { 'migration.sql': UP }, /down\.sql manquant/],
    ['down.sql vide', { 'migration.sql': UP, 'down.sql': '  \n' }, /down\.sql vide/],
    [
      'down.sql fait de commentaires',
      { 'migration.sql': UP, 'down.sql': '-- rien\n/* non */\n' },
      /down\.sql vide/,
    ],
    ['migration.sql manquant', { 'down.sql': DOWN }, /migration\.sql manquant/],
    [
      'down.sql qui valide sa transaction',
      { 'migration.sql': UP, 'down.sql': 'DROP TABLE t;\nCOMMIT;\n' },
      /transaction/,
    ],
    [
      'down.sql non transactionnel',
      { 'migration.sql': UP, 'down.sql': 'DROP INDEX CONCURRENTLY i;\n' },
      /transaction/,
    ],
  ])('signale une migration %s', (_, files, problem) => {
    const dir = fixture({ '20261026000000_a': files });
    expect(conventionProblems(dir).join('\n')).toMatch(problem);
  });

  it.each([
    [
      'une fonction plpgsql restaurée',
      'CREATE OR REPLACE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  RETURN NEW;\nEND;\n$$;\n',
    ],
    [
      'une fonction à corps balisé',
      'CREATE FUNCTION g() RETURNS int LANGUAGE plpgsql AS $body$ BEGIN RETURN 1; END $body$;\n',
    ],
    ['une vue avec CASE … END', 'CREATE VIEW v AS SELECT CASE WHEN true THEN 1 ELSE 0 END AS x;\n'],
    ['une chaîne contenant commit', "UPDATE t SET s = 'commit';\n"],
    ['un identifiant entre guillemets', 'DROP TABLE "end";\n'],
  ])('accepte un down.sql valide contenant %s', (_, down) => {
    const dir = fixture({ '20261026000000_a': { 'migration.sql': UP, 'down.sql': down } });
    expect(conventionProblems(dir)).toEqual([]);
  });

  it('signale un dossier mal nommé', () => {
    const dir = fixture({ init: { 'migration.sql': UP, 'down.sql': DOWN } });
    expect(conventionProblems(dir).join('\n')).toMatch(/nom invalide/);
  });
});
