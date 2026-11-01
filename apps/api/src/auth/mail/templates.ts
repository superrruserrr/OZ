// Gabarits des emails d'authentification (lot 1.3a), en français. Les gabarits React Email et les
// autres langues arrivent avec les notifications (lot 1.15).

export interface MailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Durées affichées : mêmes valeurs que les jetons (auth.service.ts). */
const VERIFICATION_VALIDITY = '24 heures';
const RESET_VALIDITY = '30 minutes';

/**
 * Le jeton voyage dans le fragment (`#token=`) : le navigateur ne l'envoie ni au serveur web ni dans
 * l'en-tête Referer, il n'apparaît dans aucun journal d'accès.
 */
export function verificationLink(appUrl: string, token: string): string {
  return `${appUrl}/auth/verify-email#token=${token}`;
}

export function resetLink(appUrl: string, token: string): string {
  return `${appUrl}/auth/reset#token=${token}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(
  paragraphs: readonly string[],
  link?: { readonly label: string; readonly href: string },
) {
  const text = [
    ...paragraphs,
    ...(link ? [`${link.label} : ${link.href}`] : []),
    "L'équipe OZ",
  ].join('\n\n');
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const action = link
    ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p><p>${escapeHtml(link.href)}</p>`
    : '';
  const html = `<!doctype html><html lang="fr"><body>${body}${action}<p>L'équipe OZ</p></body></html>`;
  return { text, html };
}

export function verificationEmail(link: string): MailContent {
  return {
    subject: 'Confirmez votre adresse email',
    ...layout(
      [
        'Bienvenue sur OZ.',
        `Pour activer votre compte, confirmez votre adresse email. Ce lien est valable ${VERIFICATION_VALIDITY} et ne sert qu'une fois.`,
        "Si vous n'avez pas créé de compte, ignorez ce message.",
      ],
      { label: 'Confirmer mon adresse', href: link },
    ),
  };
}

/** Inscription avec une adresse déjà utilisée : même réponse côté site, l'information arrive ici. */
export function alreadyRegisteredEmail(forgotPasswordUrl: string): MailContent {
  return {
    subject: 'Vous avez déjà un compte OZ',
    ...layout(
      [
        'Quelqu’un, sans doute vous, a voulu créer un compte OZ avec cette adresse, qui en possède déjà un.',
        'Si vous avez oublié votre mot de passe, vous pouvez le réinitialiser.',
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre compte n'a pas changé.",
      ],
      { label: 'Réinitialiser mon mot de passe', href: forgotPasswordUrl },
    ),
  };
}

export function passwordResetEmail(link: string): MailContent {
  return {
    subject: 'Réinitialisation de votre mot de passe',
    ...layout(
      [
        `Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable ${RESET_VALIDITY} et ne sert qu'une fois.`,
        "Si la demande n'est pas de vous, ignorez ce message : votre mot de passe reste inchangé.",
      ],
      { label: 'Choisir un nouveau mot de passe', href: link },
    ),
  };
}

export function passwordChangedEmail(): MailContent {
  return {
    subject: 'Votre mot de passe a été modifié',
    ...layout([
      'Le mot de passe de votre compte OZ vient d’être modifié. Toutes vos sessions ont été fermées.',
      "Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support OZ.",
    ]),
  };
}

// Alertes de sécurité (lot 1.3b, D5) : aucun jeton, aucune IP, aucun User-Agent brut ; le libellé
// d'appareil vient de listes fermées (device.ts) et reste échappé dans le HTML.

/** Date lisible, en UTC tant que le fuseau de l'utilisateur n'est pas connu (lot 1.15). */
export function formatWhen(when: Date): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(when);
  return `${formatted} (UTC)`;
}

export function newDeviceLoginEmail(device: string, when: Date, resetUrl: string): MailContent {
  return {
    subject: 'Nouvelle connexion à votre compte OZ',
    ...layout(
      [
        `Une connexion à votre compte OZ a eu lieu le ${formatWhen(when)} depuis un appareil que nous ne connaissions pas : ${device}.`,
        "Si c'est vous, il n'y a rien à faire.",
        'Sinon, changez votre mot de passe : toutes les sessions ouvertes seront fermées.',
      ],
      { label: 'Changer mon mot de passe', href: resetUrl },
    ),
  };
}

export function sessionReuseAlertEmail(when: Date, resetUrl: string): MailContent {
  return {
    subject: 'Activité suspecte sur votre compte OZ',
    ...layout(
      [
        `Le ${formatWhen(when)}, une session de votre compte OZ a été utilisée de façon anormale : un jeton de connexion déjà remplacé a été présenté de nouveau, ce qui peut indiquer qu'il a été copié.`,
        'Par précaution, nous avons fermé la session concernée sur tous les appareils qui la partageaient.',
        'Si vous ne reconnaissez pas cette activité, changez votre mot de passe : toutes vos sessions seront fermées.',
      ],
      { label: 'Changer mon mot de passe', href: resetUrl },
    ),
  };
}

// Alertes de la 2FA (lot 1.3cb) : ni secret, ni code, ni reste de codes de secours.

export function twoFactorEnabledEmail(when: Date, resetUrl: string): MailContent {
  return {
    subject: 'Validation en deux étapes activée sur votre compte OZ',
    ...layout(
      [
        `La validation en deux étapes a été activée sur votre compte OZ le ${formatWhen(when)}. Vos autres sessions ont été fermées.`,
        "Si vous n'êtes pas à l'origine de ce changement, changez votre mot de passe et contactez le support OZ.",
      ],
      { label: 'Changer mon mot de passe', href: resetUrl },
    ),
  };
}

export function twoFactorDisabledEmail(when: Date, resetUrl: string): MailContent {
  return {
    subject: 'Validation en deux étapes désactivée sur votre compte OZ',
    ...layout(
      [
        `La validation en deux étapes a été désactivée sur votre compte OZ le ${formatWhen(when)}. Vos autres sessions ont été fermées.`,
        "Si vous n'êtes pas à l'origine de ce changement, changez votre mot de passe et contactez le support OZ.",
      ],
      { label: 'Changer mon mot de passe', href: resetUrl },
    ),
  };
}

export function recoveryCodeUsedEmail(when: Date, resetUrl: string): MailContent {
  return {
    subject: 'Code de secours utilisé sur votre compte OZ',
    ...layout(
      [
        `Un code de secours de votre compte OZ a été utilisé le ${formatWhen(when)}. Il ne servira plus.`,
        "Si ce n'est pas vous, votre mot de passe et vos codes sont compromis : changez votre mot de passe et contactez le support OZ.",
      ],
      { label: 'Changer mon mot de passe', href: resetUrl },
    ),
  };
}

export function recoveryCodesReplacedEmail(when: Date, resetUrl: string): MailContent {
  return {
    subject: 'Codes de secours régénérés sur votre compte OZ',
    ...layout(
      [
        `De nouveaux codes de secours ont été créés pour votre compte OZ le ${formatWhen(when)}. Les anciens ne servent plus.`,
        "Si vous n'êtes pas à l'origine de ce changement, changez votre mot de passe et contactez le support OZ.",
      ],
      { label: 'Changer mon mot de passe', href: resetUrl },
    ),
  };
}
