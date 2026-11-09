import { startApiStack } from '../auth/api-stack.js';

// Parcours n° 9 (lot 1.16cbb) : pile de l'API avec le worker compilé (export et suppression).
export default function startGdprStack(): Promise<() => Promise<void>> {
  return startApiStack({ gdpr: true });
}
