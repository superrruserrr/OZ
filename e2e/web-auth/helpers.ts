import { expect, type BrowserContext, type Page } from '@playwright/test';
import { API_URL, WEB_ORIGIN } from '../auth/api-stack.js';
import { mailTo, tokenIn } from '../auth/flows.js';

// Outils communs des parcours du site (lots 1.7ca et 1.7cb, ADR-010). Données synthétiques seulement.

export const ACCESS = '__Host-oz_access';
export const REFRESH = '__Host-oz_refresh';

/** Attend la fin des animations finies (les boucles comme le halo E1 sont ignorées). */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((animation) => animation.playState === 'finished'),
  );
}

/** Toute requête du navigateur vers l'API trahirait un appel direct, interdit par l'ADR-010. */
export function watchApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(API_URL)) calls.push(request.url());
  });
  return calls;
}

export async function sessionCookie(context: BrowserContext, name: string) {
  return (await context.cookies(WEB_ORIGIN)).find((cookie) => cookie.name === name);
}

/**
 * Adresse du client propre au test (plage de documentation 198.51.100.0/24) : recopiée par le site
 * dans `X-Forwarded-For`, elle sépare les limites par IP de chaque parcours (TRUST_PROXY=1).
 */
export async function useClientAddress(page: Page, host: number): Promise<void> {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${String(host)}` });
}

export async function signUpAndConfirm(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/role');
  await page.getByTestId('role-continue').click();
  await expect(page).toHaveURL(/\/auth\/signup\/player$/);
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(password);
  // Jeton de formulaire (D6 du lot 1.3ca) : refusé avant 3 s.
  await page.waitForTimeout(3_100);
  await page.getByTestId('signup-submit').click();
  await expect(page.getByTestId('signup-sent')).toBeVisible();

  const token = tokenIn(await mailTo(email, 'Confirmez votre adresse email'));
  await page.goto(`/auth/verify-email#token=${token}`);
  await expect(page.getByTestId('verify-done')).toBeVisible();
  // Le jeton est retiré de l'adresse et de l'historique dès sa lecture.
  expect(new URL(page.url()).hash).toBe('');
}

/** Connexion depuis l'écran de connexion ; sans `next`, le parcours d'inscription s'ouvre. */
export async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}
