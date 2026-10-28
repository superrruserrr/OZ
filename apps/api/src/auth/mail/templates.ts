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
