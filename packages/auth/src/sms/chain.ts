import type { SmsAttempt, SmsChannel, SmsFailureCode, SmsRoute } from './provider.js';

export interface SmsFailure {
  readonly provider: string;
  readonly channel: SmsChannel;
  readonly code: SmsFailureCode;
}

export type SmsDelivery =
  | {
      readonly delivered: true;
      readonly provider: string;
      readonly channel: SmsChannel;
      readonly failures: readonly SmsFailure[];
    }
  | { readonly delivered: false; readonly failures: readonly SmsFailure[] };

/**
 * Repli de TD-012 (D6) : routes essayées dans l'ordre, bascule sur erreur ou délai de l'appel. Un
 * message accepté puis jamais livré ne bascule pas : aucun accusé de réception n'est lu (DEBT).
 */
export class SmsChain {
  constructor(private readonly routes: readonly SmsRoute[]) {}

  /** `only` restreint à un canal : un renvoi par SMS saute WhatsApp. Ne lève jamais. */
  async deliver(to: string, code: string, only?: SmsChannel): Promise<SmsDelivery> {
    const failures: SmsFailure[] = [];
    for (const route of this.routes) {
      if (only !== undefined && route.channel !== only) continue;
      const { provider, channel } = route;
      const attempt = await SmsChain.attempt(route, to, code);
      if (attempt.ok) return { delivered: true, provider, channel, failures };
      failures.push({ provider, channel, code: attempt.code });
    }
    return { delivered: false, failures };
  }

  /** Une route qui lève, même avant sa première attente, n'interrompt pas la chaîne. */
  private static async attempt(route: SmsRoute, to: string, code: string): Promise<SmsAttempt> {
    try {
      return await route.send(to, code);
    } catch {
      return { ok: false, code: 'unexpected' };
    }
  }
}
