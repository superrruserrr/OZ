import { startApiStack } from '../auth/api-stack.js';

// Pile des écrans de compte (lot 1.7ca, ADR-010) : l'API compilée contre PostgreSQL, Redis, S3 et
// Mailpit jetables ; le site est lancé par le `webServer` de e2e/web-auth.config.ts et relaie l'API.
// TRUST_PROXY=1 : le site tient la place du dernier mandataire et recopie `X-Forwarded-For` ; chaque
// test pose sa propre adresse, comme le ferait Traefik, sans épuiser `register_ip` (3 par heure).
export default function startWebAuthStack(): Promise<() => Promise<void>> {
  return startApiStack({ trustProxy: 1 });
}
