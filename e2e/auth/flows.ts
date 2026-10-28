import { randomBytes, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { WEB_ORIGIN } from './api-stack.js';

// Outils des parcours : données synthétiques seulement (adresses example.test, mots de passe tirés
// au hasard). Le cookie de rafraîchissement est porté à la main : `__Host-` exige HTTPS, absent ici.

export const REFRESH_COOKIE = '__Host-oz_refresh';

export const syntheticEmail = (): string => `e2e-${randomUUID()}@example.test`;
/** Mot de passe aléatoire : jamais présent dans HaveIBeenPwned. */
export const syntheticPassword = (): string => `E2e-${randomBytes(18).toString('base64url')}`;

interface MailSummary {
  readonly ID: string;
  readonly Subject: string;
}

const mailpit = (): string => {
  const url = process.env.E2E_MAILPIT_URL;
  if (url === undefined) throw new Error('Mailpit non démarré (global setup)');
  return url;
};

async function search(to: string): Promise<MailSummary[]> {
  const response = await fetch(
    `${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  );
  return ((await response.json()) as { messages: MailSummary[] }).messages;
}

/** Texte du dernier email `subject` reçu par `to`, attendu jusqu'à 15 s. */
export async function mailTo(to: string, subject: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const found = (await search(to)).find((message) => message.Subject === subject);
    if (found) {
      const body = await fetch(`${mailpit()}/api/v1/message/${found.ID}`);
      return ((await body.json()) as { Text: string }).Text;
    }
    if (Date.now() > deadline) throw new Error(`aucun email « ${subject} »`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Jeton du lien d'un email (fragment `#token=`). */
export function tokenIn(text: string): string {
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(text);
  if (!match?.[1]) throw new Error('aucun jeton dans le message');
  return match[1];
}

/** Valeur du cookie de rafraîchissement posé par la réponse. */
export function refreshCookieOf(response: APIResponse): string {
  const header = response
    .headersArray()
    .find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(`${REFRESH_COOKIE}=`));
  const value = header?.value.slice(REFRESH_COOKIE.length + 1).split(';')[0] ?? '';
  expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return value;
}

export async function registerAndConfirm(
  api: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  expect((await api.post('/auth/register', { data: { email, password } })).status()).toBe(202);
  const token = tokenIn(await mailTo(email, 'Confirmez votre adresse email'));
  expect((await api.post('/auth/verify-email', { data: { token } })).status()).toBe(200);
}

export const login = (api: APIRequestContext, email: string, password: string) =>
  api.post('/auth/login', { data: { email, password } });

export const refresh = (api: APIRequestContext, cookie: string) =>
  api.post('/auth/refresh', {
    headers: { Origin: WEB_ORIGIN, Cookie: `${REFRESH_COOKIE}=${cookie}` },
  });
