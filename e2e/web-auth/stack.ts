import { startApiStack } from '../auth/api-stack.js';

// Pile des écrans de compte (lot 1.7ca, ADR-010) : l'API compilée contre PostgreSQL, Redis, S3 et
// Mailpit jetables ; le site est lancé par le `webServer` de e2e/web-auth.config.ts et relaie l'API.
export default function startWebAuthStack(): Promise<() => Promise<void>> {
  return startApiStack();
}
