import { resolveAppEnv } from '@oz/config/security-headers';

/**
 * Appelé une fois au démarrage du serveur Next (D-021) : un APP_ENV absent (build de production) ou
 * invalide arrête le serveur immédiatement, au lieu de répondre 500 à chaque requête. Next ne fait que
 * journaliser une erreur levée ici : dans le runtime Node, le processus est arrêté explicitement
 * (module séparé : ce fichier est aussi compilé pour le runtime Edge, sans process.exit).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { exitOnInvalidAppEnv } = await import('./instrumentation-node');
    exitOnInvalidAppEnv();
    return;
  }
  resolveAppEnv(process.env.APP_ENV, process.env.NODE_ENV);
}
