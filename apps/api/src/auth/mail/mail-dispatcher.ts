import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { mailErrorCode } from './auth-mailer.js';

/**
 * Envoi des emails d'authentification après la réponse (lots 1.3a et 1.3b) : la durée de la
 * réponse ne dépend pas du serveur SMTP (CP-28), et un échec n'empêche pas de répondre.
 */
@Injectable()
export class MailDispatcher implements BeforeApplicationShutdown {
  private readonly pending = new Set<Promise<void>>();

  constructor(@InjectPinoLogger(MailDispatcher.name) private readonly logger: PinoLogger) {}

  /** Lance l'envoi sans l'attendre ; un échec est journalisé avec son seul code. */
  sendLater(kind: string, send: () => Promise<void>): void {
    // Ni le message d'erreur ni la réponse SMTP ne sont journalisés : ils peuvent citer l'adresse.
    const pending = send().catch((error: unknown) => {
      this.logger.error(
        { event: 'auth.mail.failed', kind, code: mailErrorCode(error) },
        "Échec d'envoi d'un email d'authentification",
      );
    });
    this.pending.add(pending);
    void pending.finally(() => this.pending.delete(pending));
  }

  /** Attend les envois en cours (arrêt propre, tests). */
  async flush(): Promise<void> {
    // Un envoi lancé pendant l'attente (requête encore servie à l'arrêt) est attendu lui aussi.
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  /** Arrêt (SIGTERM d'un déploiement) : les emails déjà annoncés par une réponse partent. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.flush();
  }
}
