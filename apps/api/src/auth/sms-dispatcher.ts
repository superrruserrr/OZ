import { Inject, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import type { SmsChain, SmsChannel } from '@oz/auth';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SMS_CHAIN } from './auth.tokens.js';

/**
 * Envoi des OTP après la réponse (lot 1.3cc, D7), comme `MailDispatcher` : la durée et le contenu de
 * la réponse ne dépendent pas du fournisseur. Le journal ne porte que le canal, le fournisseur et les
 * codes d'échec, jamais le numéro ni le code (EX-T19).
 */
@Injectable()
export class SmsDispatcher implements BeforeApplicationShutdown {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(SMS_CHAIN) private readonly chain: Pick<SmsChain, 'deliver'>,
    @InjectPinoLogger(SmsDispatcher.name) private readonly logger: PinoLogger,
  ) {}

  sendLater(to: string, code: string, only?: SmsChannel): void {
    const pending = this.send(to, code, only).catch((error: unknown) => {
      // Journal défaillant, par exemple : jamais de rejet non traité qui arrêterait l'API.
      process.stderr.write(`auth.otp.dispatch_failed ${(error as Error).name}\n`);
    });
    this.pending.add(pending);
    void pending.finally(() => this.pending.delete(pending));
  }

  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  /** Arrêt (SIGTERM d'un déploiement) : les codes déjà annoncés par une réponse partent. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  private async send(to: string, code: string, only?: SmsChannel): Promise<void> {
    const result = await this.chain.deliver(to, code, only);
    if (result.delivered) {
      const { provider, channel, failures } = result;
      this.logger.info({ event: 'auth.otp.sent', provider, channel, failures }, 'OTP accepté');
    } else {
      this.logger.error(
        { event: 'auth.otp.failed', failures: result.failures },
        'Échec de toute la chaîne d’envoi OTP',
      );
    }
  }
}
