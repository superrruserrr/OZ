import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cliEnvironment } from '../target.js';

const ROOT_ENV = fileURLToPath(new URL('../../../../.env', import.meta.url));

/** Environnement validé d'une commande à risque (voir cliEnvironment). */
export function commandEnvironment(): ReturnType<typeof cliEnvironment> {
  return cliEnvironment(process.env, existsSync(ROOT_ENV) ? readFileSync(ROOT_ENV, 'utf8') : '');
}

/** Valeur d'une option `--nom=valeur`. */
export const option = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

export function fail(error: unknown): void {
  process.stderr.write(`✖ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
