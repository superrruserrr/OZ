import type { OnApplicationShutdown } from '@nestjs/common';
import type { AuthConfig } from '@oz/config';
import { createTransport, type SMTPTransportOptions, type Transporter } from 'nodemailer';
import type { AuthMailer } from './auth-mailer.js';
import {
  alreadyRegisteredEmail,
  newDeviceLoginEmail,
  passwordChangedEmail,
  passwordResetEmail,
  resetLink,
  recoveryCodesReplacedEmail,
  recoveryCodeUsedEmail,
  sessionReuseAlertEmail,
  phoneChangedEmail,
  twoFactorDisabledEmail,
  twoFactorEnabledEmail,
  verificationEmail,
  verificationLink,
  type MailContent,
} from './templates.js';

const SMTPS_PORT = 465;
const TIMEOUT_MS = 10_000;

/**
 * Options du transport : TLS exigé hors poste local (implicite sur 465, STARTTLS obligatoire
 * sinon), jamais tenté vers Mailpit ; certificat toujours vérifié.
 */
export function smtpTransportOptions(smtp: AuthConfig['smtp']): SMTPTransportOptions {
  const implicitTls = smtp.port === SMTPS_PORT;
  return {
    host: smtp.host,
    port: smtp.port,
    secure: implicitTls,
    requireTLS: smtp.requireTls && !implicitTls,
    ignoreTLS: !smtp.requireTls && !implicitTls,
    ...(smtp.user !== undefined ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
    tls: { rejectUnauthorized: true },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  };
}

/**
 * Transport SMTP (D2 du lot 1.3a) : Mailpit en local, Scaleway TEM en recette et en production,
 * avant la file d'envoi BullMQ du lot 1.15. Une erreur d'envoi est remontée à l'appelant.
 */
export class SmtpAuthMailer implements AuthMailer, OnApplicationShutdown {
  private readonly transport: Transporter;

  constructor(private readonly config: AuthConfig) {
    this.transport = createTransport(smtpTransportOptions(config.smtp));
  }

  sendVerification(to: string, token: string): Promise<void> {
    return this.send(to, verificationEmail(verificationLink(this.config.appUrl, token)));
  }

  sendAlreadyRegistered(to: string): Promise<void> {
    return this.send(to, alreadyRegisteredEmail(this.resetUrl()));
  }

  sendPasswordReset(to: string, token: string): Promise<void> {
    return this.send(to, passwordResetEmail(resetLink(this.config.appUrl, token)));
  }

  sendPasswordChanged(to: string): Promise<void> {
    return this.send(to, passwordChangedEmail());
  }

  sendNewDeviceLogin(to: string, device: string, when: Date): Promise<void> {
    return this.send(to, newDeviceLoginEmail(device, when, this.resetUrl()));
  }

  sendSessionReuseAlert(to: string, when: Date): Promise<void> {
    return this.send(to, sessionReuseAlertEmail(when, this.resetUrl()));
  }

  sendTwoFactorEnabled(to: string, when: Date): Promise<void> {
    return this.send(to, twoFactorEnabledEmail(when, this.resetUrl()));
  }

  sendTwoFactorDisabled(to: string, when: Date): Promise<void> {
    return this.send(to, twoFactorDisabledEmail(when, this.resetUrl()));
  }

  sendRecoveryCodeUsed(to: string, when: Date): Promise<void> {
    return this.send(to, recoveryCodeUsedEmail(when, this.resetUrl()));
  }

  sendRecoveryCodesReplaced(to: string, when: Date): Promise<void> {
    return this.send(to, recoveryCodesReplacedEmail(when, this.resetUrl()));
  }

  sendPhoneChanged(to: string, when: Date): Promise<void> {
    return this.send(to, phoneChangedEmail(when, this.resetUrl()));
  }

  /** Après `MailDispatcher.beforeApplicationShutdown` : plus aucun envoi en cours. */
  onApplicationShutdown(): void {
    this.transport.close();
  }

  /** Page de réinitialisation, sans jeton : changer de mot de passe ferme toutes les sessions. */
  private resetUrl(): string {
    return `${this.config.appUrl}/auth/reset`;
  }

  private async send(to: string, content: MailContent): Promise<void> {
    await this.transport.sendMail({ from: this.config.emailFrom, to, ...content });
  }
}
