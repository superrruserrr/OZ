import { resolveAppEnv } from '@oz/config/security-headers';

/** Runtime Node : APP_ENV invalide → message sur stderr et arrêt du serveur (code 1). */
export function exitOnInvalidAppEnv(): void {
  try {
    resolveAppEnv(process.env.APP_ENV, process.env.NODE_ENV);
  } catch (error) {
    process.stderr.write(`✖ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
