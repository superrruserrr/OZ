import 'server-only';
import { headers } from 'next/headers';
import type { ApiClientContext } from './api-client';

/** En-têtes du navigateur à transmettre à l'API depuis une action serveur (ADR-010). */
export async function clientContext(): Promise<ApiClientContext> {
  try {
    const received = await headers();
    return {
      forwardedFor: received.get('x-forwarded-for'),
      userAgent: received.get('user-agent'),
    };
  } catch {
    // Hors requête (test, tâche de fond) : aucun en-tête à transmettre.
    return {};
  }
}
