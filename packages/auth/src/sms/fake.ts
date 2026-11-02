import type { SmsAttempt, SmsChannel, SmsRoute } from './provider.js';

/** Fournisseur factice, permis en local seulement (D10) : le code part au journal de développement. */
export class FakeSmsProvider implements SmsRoute {
  readonly provider = 'fake';
  readonly channel: SmsChannel = 'sms';

  constructor(private readonly write: (to: string, code: string) => void) {}

  send(to: string, code: string): Promise<SmsAttempt> {
    this.write(to, code);
    return Promise.resolve({ ok: true });
  }
}
