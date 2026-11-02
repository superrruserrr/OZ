import { describe, expect, it, vi } from 'vitest';
import {
  FakeSmsProvider,
  InfobipSmsRoute,
  InfobipWhatsappRoute,
  otpMessageText,
  SmsChain,
  TwilioSmsRoute,
  type SmsFetch,
  type SmsRoute,
} from './index.js';

const TO = '+237650000001';
const CODE = '042137';
const KEY = 'cle-factice-infobip';
const AUTH_VALUE = 'jeton-factice-twilio';

const reply =
  (status: number, body: string): SmsFetch =>
  () =>
    Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(body) });
const ACCEPTED = JSON.stringify({ messages: [{ status: { groupName: 'PENDING' } }] });

const infobip = { baseUrl: 'https://x.api.infobip.example', apiKey: KEY };
const route = (
  name: string,
  channel: 'sms' | 'whatsapp',
  result: Awaited<ReturnType<SmsRoute['send']>>,
): SmsRoute => ({
  provider: name,
  channel,
  send: () => Promise.resolve(result),
});

describe('texte du message', () => {
  it('porte le code et OZ, rien sur le compte', () => {
    const text = otpMessageText(CODE);
    expect(text).toContain(CODE);
    expect(text).toContain('OZ');
    expect(text).not.toContain(TO);
  });
});

describe('InfobipSmsRoute', () => {
  const sms = (fetch: SmsFetch, timeoutMs?: number) =>
    new InfobipSmsRoute({ ...infobip, sender: 'OZ', fetch, ...(timeoutMs ? { timeoutMs } : {}) });

  it('appelle l’API avec la clé et le numéro sans « + »', async () => {
    const fetch = vi.fn(reply(200, ACCEPTED));
    expect(await sms(fetch).send(TO, CODE)).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as Parameters<SmsFetch>;
    expect(url).toBe('https://x.api.infobip.example/sms/2/text/advanced');
    expect(init.headers.Authorization).toBe(`App ${KEY}`);
    const body = JSON.parse(init.body) as {
      messages: { from: string; destinations: { to: string }[]; text: string }[];
    };
    expect(body.messages[0]?.from).toBe('OZ');
    expect(body.messages[0]?.destinations[0]?.to).toBe('237650000001');
    expect(body.messages[0]?.text).toContain(CODE);
  });

  it('message refusé malgré le 200 : échec', async () => {
    const body = JSON.stringify({ messages: [{ status: { groupName: 'REJECTED' } }] });
    expect(await sms(reply(200, body)).send(TO, CODE)).toEqual({ ok: false, code: 'rejected' });
    for (const other of [{}, { status: {} }, { status: { groupName: 'UNDELIVERABLE' } }]) {
      const unknown = JSON.stringify({ messages: [other] });
      expect(await sms(reply(200, unknown)).send(TO, CODE)).toEqual({
        ok: false,
        code: 'rejected',
      });
    }
  });

  it('réponse illisible, vide ou trop longue : échec', async () => {
    const invalid = { ok: false, code: 'invalid_response' };
    expect(await sms(reply(200, 'pas du json')).send(TO, CODE)).toEqual(invalid);
    expect(await sms(reply(200, 'null')).send(TO, CODE)).toEqual(invalid);
    expect(await sms(reply(200, '{}')).send(TO, CODE)).toEqual(invalid);
    expect(await sms(reply(200, JSON.stringify({ messages: [] }))).send(TO, CODE)).toEqual(invalid);
    expect(await sms(reply(200, 'x'.repeat(100_001))).send(TO, CODE)).toEqual(invalid);
  });

  it('erreur HTTP : code par classe, sans le corps', async () => {
    const result = await sms(reply(401, `refus de ${KEY} pour ${TO}`)).send(TO, CODE);
    expect(result).toEqual({ ok: false, code: 'http_4xx' });
    expect(await sms(reply(503, '')).send(TO, CODE)).toEqual({ ok: false, code: 'http_5xx' });
  });

  it('réseau : échec typé, message d’erreur non conservé', async () => {
    const down: SmsFetch = () => Promise.reject(new Error(`connexion ${TO}`));
    expect(await sms(down).send(TO, CODE)).toEqual({ ok: false, code: 'network' });
  });

  it('sans fetch injecté : utilise le fetch global', async () => {
    vi.stubGlobal('fetch', vi.fn(reply(200, ACCEPTED)));
    const route = new InfobipSmsRoute({ ...infobip, sender: 'OZ' });
    expect(await route.send(TO, CODE)).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it('délai : couvre aussi la lecture du corps et abandonne la requête', async () => {
    let signal: AbortSignal | undefined;
    const stuck: SmsFetch = (_url, init) => {
      signal = init.signal;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => new Promise<string>(() => undefined),
      });
    };
    expect(await sms(stuck, 10).send(TO, CODE)).toEqual({ ok: false, code: 'timeout' });
    expect(signal?.aborted).toBe(true);
  });
});

describe('InfobipWhatsappRoute', () => {
  it('envoie le modèle d’authentification, code en paramètre', async () => {
    const fetch = vi.fn(reply(200, ACCEPTED));
    const whatsapp = new InfobipWhatsappRoute({
      ...infobip,
      sender: '237600000000',
      template: 'oz_otp',
      fetch,
    });
    expect(whatsapp.channel).toBe('whatsapp');
    expect(await whatsapp.send(TO, CODE)).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as Parameters<SmsFetch>;
    expect(url).toBe('https://x.api.infobip.example/whatsapp/1/message/template');
    const body = JSON.parse(init.body) as {
      messages: {
        from: string;
        to: string;
        content: {
          templateName: string;
          language: string;
          templateData: {
            body: { placeholders: string[] };
            buttons: { type: string; parameter: string }[];
          };
        };
      }[];
    };
    const message = body.messages[0];
    expect(message?.to).toBe('237650000001');
    expect(message?.content.templateName).toBe('oz_otp');
    expect(message?.content.language).toBe('fr');
    expect(message?.content.templateData.body.placeholders).toEqual([CODE]);
    expect(message?.content.templateData.buttons).toEqual([{ type: 'URL', parameter: CODE }]);
  });
});

describe('TwilioSmsRoute', () => {
  const options = { accountSid: 'ACfactice', authToken: AUTH_VALUE, from: '+15005550006' };

  it('poste un formulaire en authentification de base', async () => {
    const fetch = vi.fn(reply(201, '{}'));
    expect(await new TwilioSmsRoute({ ...options, fetch }).send(TO, CODE)).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as Parameters<SmsFetch>;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACfactice/Messages.json');
    const basic = Buffer.from(`ACfactice:${AUTH_VALUE}`).toString('base64');
    expect(init.headers.Authorization).toBe(`Basic ${basic}`);
    const form = new URLSearchParams(init.body);
    expect(form.get('To')).toBe(TO);
    expect(form.get('From')).toBe(options.from);
    expect(form.get('Body')).toContain(CODE);
  });

  it('erreur : échec typé', async () => {
    const route = new TwilioSmsRoute({ ...options, fetch: reply(400, 'non') });
    expect(await route.send(TO, CODE)).toEqual({ ok: false, code: 'http_4xx' });
  });
});

describe('FakeSmsProvider', () => {
  it('écrit le code dans le journal local fourni', async () => {
    const write = vi.fn();
    const fake = new FakeSmsProvider(write);
    expect(await fake.send(TO, CODE)).toEqual({ ok: true });
    expect(write).toHaveBeenCalledWith(TO, CODE);
  });
});

describe('SmsChain', () => {
  const FAILED = { ok: false, code: 'http_5xx' } as const;

  it('s’arrête au premier succès', async () => {
    const first = route('infobip', 'whatsapp', { ok: true });
    const second = route('infobip', 'sms', { ok: true });
    const spy = vi.spyOn(second, 'send');
    const result = await new SmsChain([first, second]).deliver(TO, CODE);
    expect(result).toEqual({
      delivered: true,
      provider: 'infobip',
      channel: 'whatsapp',
      failures: [],
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('bascule dans l’ordre sur échec', async () => {
    const chain = new SmsChain([
      route('infobip', 'whatsapp', FAILED),
      route('infobip', 'sms', { ok: false, code: 'timeout' }),
      route('twilio', 'sms', { ok: true }),
    ]);
    expect(await chain.deliver(TO, CODE)).toEqual({
      delivered: true,
      provider: 'twilio',
      channel: 'sms',
      failures: [
        { provider: 'infobip', channel: 'whatsapp', code: 'http_5xx' },
        { provider: 'infobip', channel: 'sms', code: 'timeout' },
      ],
    });
  });

  it('canal sms imposé : WhatsApp sauté', async () => {
    const whatsapp = route('infobip', 'whatsapp', { ok: true });
    const sms = route('infobip', 'sms', { ok: true });
    const spy = vi.spyOn(whatsapp, 'send');
    const result = await new SmsChain([whatsapp, sms]).deliver(TO, CODE, 'sms');
    expect(result).toMatchObject({ delivered: true, channel: 'sms' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('toute la chaîne en échec : résultat, pas d’exception', async () => {
    const thrower: SmsRoute = {
      provider: 'twilio',
      channel: 'sms',
      send: () => {
        throw new Error(`panne ${TO} ${CODE} ${KEY}`);
      },
    };
    const result = await new SmsChain([route('infobip', 'sms', FAILED), thrower]).deliver(TO, CODE);
    expect(result).toEqual({
      delivered: false,
      failures: [
        { provider: 'infobip', channel: 'sms', code: 'http_5xx' },
        { provider: 'twilio', channel: 'sms', code: 'unexpected' },
      ],
    });
    for (const value of [TO, CODE, KEY]) expect(JSON.stringify(result)).not.toContain(value);
  });
});
