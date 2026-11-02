import { describe, expect, it } from 'vitest';
import {
  alreadyRegisteredEmail,
  passwordChangedEmail,
  passwordResetEmail,
  recoveryCodesReplacedEmail,
  phoneChangedEmail,
  recoveryCodeUsedEmail,
  resetLink,
  twoFactorDisabledEmail,
  twoFactorEnabledEmail,
  verificationEmail,
  verificationLink,
} from './templates.js';

const APP = 'https://www.oz.example';
const TOKEN = 'abcDEF123_-'.padEnd(43, 'x');

describe('liens des emails', () => {
  it('portent le jeton dans le fragment : jamais envoyé au serveur ni dans un Referer', () => {
    expect(verificationLink(APP, TOKEN)).toBe(`${APP}/auth/verify-email#token=${TOKEN}`);
    expect(resetLink(APP, TOKEN)).toBe(`${APP}/auth/reset#token=${TOKEN}`);
  });
});

describe('gabarits (français, texte et HTML)', () => {
  it('confirmation : lien en texte et en HTML, durée de validité annoncée', () => {
    const link = verificationLink(APP, TOKEN);
    const mail = verificationEmail(link);
    expect(mail.subject).toBe('Confirmez votre adresse email');
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('24 heures');
    expect(mail.html).toContain(`href="${link}"`);
  });

  it('compte existant : ne contient aucun jeton, propose la réinitialisation', () => {
    const mail = alreadyRegisteredEmail(`${APP}/auth/reset`);
    expect(mail.subject).toBe('Vous avez déjà un compte OZ');
    expect(mail.text).toContain(`${APP}/auth/reset`);
    expect(mail.text).not.toContain('token');
  });

  it('réinitialisation : 30 minutes, et quoi faire si la demande n’est pas de vous', () => {
    const mail = passwordResetEmail(resetLink(APP, TOKEN));
    expect(mail.text).toContain('30 minutes');
    expect(mail.text).toContain('ignorez');
  });

  it('mot de passe modifié : aucun lien actif', () => {
    const mail = passwordChangedEmail();
    expect(mail.text).toContain('mot de passe');
    expect(mail.html).not.toContain('href');
  });

  it('échappe le HTML des liens', () => {
    const mail = verificationEmail('https://x.example/?a=1&b="<script>');
    expect(mail.html).toContain('a=1&amp;b=&quot;&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
  });
});

describe('alertes de la 2FA (lot 1.3cb)', () => {
  const WHEN = new Date('2026-11-01T10:00:00Z');
  const RESET = `${APP}/auth/forgot-password`;

  it.each([
    ['modifié', phoneChangedEmail],
    ['activée', twoFactorEnabledEmail],
    ['désactivée', twoFactorDisabledEmail],
    ['utilisé', recoveryCodeUsedEmail],
    ['régénérés', recoveryCodesReplacedEmail],
  ])('%s : date, lien de changement du mot de passe, texte et HTML', (word, template) => {
    const mail = template(WHEN, RESET);
    expect(mail.subject).toContain(word);
    expect(mail.text).toContain('2026');
    expect(mail.text).toContain(RESET);
    expect(mail.html).toContain(RESET);
  });
});
