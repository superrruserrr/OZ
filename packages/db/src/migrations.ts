import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier des migrations Prisma du dépôt (identique depuis src/ et dist/). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));

// Instructions qui valident la transaction de db:rollback ou ne s'exécutent pas dans une transaction :
// en tête d'instruction (BEGIN, COMMIT…) ou n'importe où pour CONCURRENTLY.
const TRANSACTION_CONTROL = /^(BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|VACUUM)\b/i;

/**
 * Le SQL sans corps de fonction ($$…$$, $balise$…$balise$), chaînes ni identifiants entre guillemets :
 * un BEGIN … END de plpgsql ou un CASE … END ne sont pas des contrôles de transaction.
 */
function outsideBodiesAndLiterals(sql: string): string {
  return sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

function breaksTransaction(sql: string): boolean {
  const code = outsideBodiesAndLiterals(sql);
  return (
    /\bCONCURRENTLY\b/i.test(code) ||
    code.split(';').some((statement) => TRANSACTION_CONTROL.test(statement.trim()))
  );
}

// Nom produit par Prisma Migrate : horodatage UTC sur 14 chiffres, puis un nom en snake_case.
const NAME = /^\d{14}_[a-z0-9_]+$/;

export interface Migration {
  readonly name: string;
  readonly upPath: string;
  readonly downPath: string;
}

/** Migrations du dossier, dans l'ordre d'application (ordre lexical de l'horodatage). */
export function listMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .sort()
    .map((name) => ({
      name,
      upPath: join(dir, name, 'migration.sql'),
      downPath: join(dir, name, 'down.sql'),
    }));
}

/** Contenu SQL utile : sans commentaires ni espaces. */
function sqlBody(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim();
}

/**
 * Écarts à la convention (docs/db/migrations.md, EX-T09.1) : chaque migration a un `migration.sql`
 * (up) et un `down.sql` non vides, dans un dossier nommé comme Prisma les produit.
 */
export function conventionProblems(dir: string = MIGRATIONS_DIR): string[] {
  const problems: string[] = [];
  for (const { name, upPath, downPath } of listMigrations(dir)) {
    if (!NAME.test(name)) problems.push(`${name} : nom invalide (horodatage_nom attendu)`);
    for (const [label, path] of [
      ['migration.sql', upPath],
      ['down.sql', downPath],
    ] as const) {
      if (!existsSync(path)) problems.push(`${name} : ${label} manquant`);
      else if (sqlBody(path) === '') problems.push(`${name} : ${label} vide`);
    }
    // db:rollback exécute down.sql dans une transaction : rien ne doit la valider ni l'interdire.
    if (existsSync(downPath) && breaksTransaction(sqlBody(downPath))) {
      problems.push(`${name} : down.sql incompatible avec une transaction (COMMIT, CONCURRENTLY…)`);
    }
  }
  return problems;
}
