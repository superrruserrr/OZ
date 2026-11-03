import type { WorkerConfig } from '@oz/config';
import { createTransport, type SMTPTransportOptions, type Transporter } from 'nodemailer';

// SMTP du worker (lot 1.16bb, D5) : email « archive prête », mêmes règles de transport que l'API
// (`apps/api/src/auth/mail/smtp-auth-mailer.ts`) : TLS exigé hors local, certificat vérifié. Ni
// URL signée ni donnée dans l'email : seulement l'invitation à se connecter (gabarit dupliqué
// jusqu'à la file d'envoi du lot 1.15, D-115).

type SmtpConfig = NonNullable<WorkerConfig['smtp']>;

const SMTPS_PORT = 465;
const TIMEOUT_MS = 10_000;

export interface MailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function smtpTransportOptions(
  smtp: SmtpConfig,
  appEnv: WorkerConfig['appEnv'],
): SMTPTransportOptions {
  const implicitTls = smtp.port === SMTPS_PORT;
  const requireTls = appEnv !== 'local';
  return {
    host: smtp.host,
    port: smtp.port,
    secure: implicitTls,
    requireTLS: requireTls && !implicitTls,
    ignoreTLS: !requireTls && !implicitTls,
    ...(smtp.user !== undefined ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
    tls: { rejectUnauthorized: true },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** « Votre export est prêt » : disponible 7 jours (D3), téléchargé depuis le compte (D4). */
export function dataExportReadyEmail(appUrl: string): MailContent {
  const paragraphs = [
    "L'archive de vos données OZ est prête. Elle reste disponible 7 jours.",
    'Pour la télécharger, connectez-vous à votre compte OZ.',
    "Si vous n'êtes pas à l'origine de cette demande, changez votre mot de passe et contactez le support OZ.",
  ];
  const label = 'Se connecter à OZ';
  return {
    subject: 'Votre export de données OZ est prêt',
    text: [...paragraphs, `${label} : ${appUrl}`, "L'équipe OZ"].join('\n\n'),
    html: `<!doctype html><html lang="fr"><body>${paragraphs
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('')}<p><a href="${escapeHtml(appUrl)}">${escapeHtml(label)}</a></p><p>${escapeHtml(
      appUrl,
    )}</p><p>L'équipe OZ</p></body></html>`,
  };
}

/** Envoi d'un email ; une erreur d'envoi est remontée à l'appelant. */
export class WorkerMailer {
  private readonly transport: Transporter;

  constructor(
    private readonly smtp: SmtpConfig,
    appEnv: WorkerConfig['appEnv'],
  ) {
    this.transport = createTransport(smtpTransportOptions(smtp, appEnv));
  }

  async sendDataExportReady(to: string): Promise<void> {
    await this.transport.sendMail({
      from: this.smtp.from,
      to,
      ...dataExportReadyEmail(this.smtp.appUrl),
    });
  }

  close(): void {
    this.transport.close();
  }
}
