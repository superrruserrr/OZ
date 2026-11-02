import { postBounded, type SmsHttpOptions } from './http.js';
import {
  bareNumber,
  otpMessageText,
  type SmsAttempt,
  type SmsChannel,
  type SmsRoute,
} from './provider.js';

export interface InfobipOptions extends SmsHttpOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
}

const ACCEPTED_GROUPS: ReadonlySet<unknown> = new Set(['PENDING', 'DELIVERED']);

/** Infobip répond 200 même pour un message refusé : le verdict est dans le corps. */
function judge(body: string): SmsAttempt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, code: 'invalid_response' };
  }
  const messages = (parsed as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, code: 'invalid_response' };
  }
  // Liste blanche : tout autre statut, ou aucun, bascule vers la route suivante.
  const accepted = (messages as { status?: { groupName?: unknown } }[]).every((message) =>
    ACCEPTED_GROUPS.has(message.status?.groupName),
  );
  return accepted ? { ok: true } : { ok: false, code: 'rejected' };
}

async function post(options: InfobipOptions, path: string, payload: unknown): Promise<SmsAttempt> {
  const result = await postBounded(
    `${options.baseUrl}${path}`,
    {
      Authorization: `App ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    JSON.stringify(payload),
    options,
  );
  return result.ok ? judge(result.body) : result;
}

export class InfobipSmsRoute implements SmsRoute {
  readonly provider = 'infobip';
  readonly channel: SmsChannel = 'sms';

  constructor(private readonly options: InfobipOptions & { readonly sender: string }) {}

  send(to: string, code: string): Promise<SmsAttempt> {
    return post(this.options, '/sms/2/text/advanced', {
      messages: [
        {
          from: this.options.sender,
          destinations: [{ to: bareNumber(to) }],
          text: otpMessageText(code),
        },
      ],
    });
  }
}

export class InfobipWhatsappRoute implements SmsRoute {
  readonly provider = 'infobip';
  readonly channel: SmsChannel = 'whatsapp';

  constructor(
    private readonly options: InfobipOptions & {
      readonly sender: string;
      /** Modèle d'authentification approuvé par WhatsApp (TD-012). */
      readonly template: string;
    },
  ) {}

  send(to: string, code: string): Promise<SmsAttempt> {
    return post(this.options, '/whatsapp/1/message/template', {
      messages: [
        {
          from: this.options.sender,
          to: bareNumber(to),
          content: {
            templateName: this.options.template,
            templateData: {
              body: { placeholders: [code] },
              buttons: [{ type: 'URL', parameter: code }],
            },
            language: 'fr',
          },
        },
      ],
    });
  }
}
