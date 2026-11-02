import { RecaptchaVerifier, type SmsRoute } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import { describe, expect, it, vi } from 'vitest';
import { recaptchaVerifierFor, smsChainFor } from './auth.module.js';

// Le banc HTTP remplace le vérificateur par un double : sa fabrique est vérifiée ici.

const base = { appUrl: 'https://recette.oz.example:8443' } as AuthConfig;

describe('recaptchaVerifierFor (D4 du lot 1.3ca)', () => {
  it('sans secret : aucune vérification', () => {
    expect(recaptchaVerifierFor({ ...base, recaptcha: undefined })).toBeNull();
  });

  it('avec secret : vérificateur construit', () => {
    expect(
      recaptchaVerifierFor({ ...base, recaptcha: { secretKey: 'r'.repeat(40), minScore: 0.5 } }),
    ).toBeInstanceOf(RecaptchaVerifier);
  });
});

describe('smsChainFor (TD-012, lot 1.3cc)', () => {
  const sms = { allowedPrefixes: ['+237'], fake: false, infobip: undefined, twilio: undefined };
  const infobip = {
    baseUrl: 'https://x.api.infobip.example',
    apiKey: 'i'.repeat(40),
    smsSender: 'OZ',
    whatsappSender: '237600000000',
    whatsappTemplate: 'oz_otp',
  };
  const twilio = { accountSid: 'ACx', authToken: 't'.repeat(32), from: '+15005550006' };
  const routesOf = (config: AuthConfig['sms']) =>
    (smsChainFor({ ...base, sms: config }) as unknown as { routes: SmsRoute[] }).routes.map(
      (route) => `${route.provider}:${route.channel}`,
    );

  it('ordre : WhatsApp, SMS Infobip, SMS Twilio', () => {
    expect(routesOf({ ...sms, infobip, twilio })).toEqual([
      'infobip:whatsapp',
      'infobip:sms',
      'twilio:sms',
    ]);
  });

  it('factice seul en local, écrit sur la sortie standard', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(routesOf({ ...sms, fake: true })).toEqual(['fake:sms']);
    await smsChainFor({ ...base, sms: { ...sms, fake: true } }).deliver('+237650000001', '042137');
    expect(write).toHaveBeenCalledWith('[sms-factice] +237650000001 042137\n');
    write.mockRestore();
  });
});
