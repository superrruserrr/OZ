import { startApiStack } from '../auth/api-stack.js';

// Parcours n° 10 (lot 1.9cb) : pile de l'API avec le coffre ouvert, ClamAV et le worker compilé.
export default function startDocumentStack(): Promise<() => Promise<void>> {
  return startApiStack({ documents: true });
}
