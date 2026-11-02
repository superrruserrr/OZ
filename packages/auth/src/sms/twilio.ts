import { postBounded, type SmsHttpOptions } from './http.js';
import { otpMessageText, type SmsAttempt, type SmsChannel, type SmsRoute } from './provider.js';

export interface TwilioOptions extends SmsHttpOptions {
  readonly accountSid: string;
  readonly authToken: string;
  readonly from: string;
}

/** Secours (TD-012) : réponse 2xx = message accepté. */
export class TwilioSmsRoute implements SmsRoute {
  readonly provider = 'twilio';
  readonly channel: SmsChannel = 'sms';

  constructor(private readonly options: TwilioOptions) {}

  async send(to: string, code: string): Promise<SmsAttempt> {
    const { accountSid, authToken, from } = this.options;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const result = await postBounded(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      new URLSearchParams({ To: to, From: from, Body: otpMessageText(code) }).toString(),
      this.options,
    );
    return result.ok ? { ok: true } : result;
  }
}
