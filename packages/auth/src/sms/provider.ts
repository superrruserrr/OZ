// Envoi d'un OTP (lot 1.3cc, TD-012). Une route est un couple fournisseur et canal ; la chaîne les
// essaie dans l'ordre. Rien de ce qui sort d'ici ne porte le numéro, le code, une clé ni un corps de
// réponse : seul un code d'échec remonte vers les journaux.

export type SmsChannel = 'whatsapp' | 'sms';

export type SmsFailureCode =
  'timeout' | 'network' | 'http_4xx' | 'http_5xx' | 'rejected' | 'invalid_response' | 'unexpected';

export type SmsAttempt =
  { readonly ok: true } | { readonly ok: false; readonly code: SmsFailureCode };

export interface SmsRoute {
  readonly provider: string;
  readonly channel: SmsChannel;
  send(to: string, code: string): Promise<SmsAttempt>;
}

/** Texte du SMS : le code et l'expéditeur, rien sur le compte. */
export const otpMessageText = (code: string): string =>
  `OZ : votre code de vérification est ${code}. Valable 5 minutes. Ne le communiquez à personne.`;

/** Numéro sans « + », comme l'attend Infobip. */
export const bareNumber = (to: string): string => to.replace(/^\+/, '');
