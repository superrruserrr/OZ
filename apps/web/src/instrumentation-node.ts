import { resolveAppEnv } from '@oz/config/security-headers';
import { assertApiConfig } from './session/api-client';

/**
 * Runtime Node : APP_ENV invalide, ou API_URL / APP_URL absentes hors local ou invalides (ADR-010)
 * → message sur stderr et arrêt du serveur (code 1).
 */
export function exitOnInvalidAppEnv(): void {
  try {
    assertApiConfig(resolveAppEnv(process.env.APP_ENV, process.env.NODE_ENV));
  } catch (error) {
    process.stderr.write(`✖ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
