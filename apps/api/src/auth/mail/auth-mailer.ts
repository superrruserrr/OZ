/** Envoi des emails d'authentification ; jetons en clair, transmis seulement au destinataire. */
export interface AuthMailer {
  sendVerification(to: string, token: string): Promise<void>;
  sendAlreadyRegistered(to: string): Promise<void>;
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendPasswordChanged(to: string): Promise<void>;
  /** Connexion depuis un appareil inconnu depuis 90 jours (D5 du lot 1.3b). */
  sendNewDeviceLogin(to: string, device: string, when: Date): Promise<void>;
  /** Jeton de rafraîchissement rejoué : famille révoquée (EX-103 n° 5). */
  sendSessionReuseAlert(to: string, when: Date): Promise<void>;
}

export const AUTH_MAILER = Symbol('AUTH_MAILER');

const SYSTEM_ERROR_CODE = /^E[A-Z]{2,20}$/;

/**
 * Code d'erreur système ou SMTP de nodemailer (`ECONNREFUSED`, `EAUTH`, `ETIMEDOUT`…), seul détail
 * d'un échec d'envoi qui soit journalisable : le message et la réponse du serveur peuvent citer
 * l'adresse du destinataire.
 */
export function mailErrorCode(error: unknown): string {
  const code: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  return typeof code === 'string' && SYSTEM_ERROR_CODE.test(code) ? code : 'UNKNOWN';
}
