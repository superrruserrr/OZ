import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { API_URL, WEB_ORIGIN } from '../auth/api-stack.js';
import { mailTo, syntheticEmail, syntheticPassword, tokenIn } from '../auth/flows.js';

// Écrans de compte (lot 1.7ca, ADR-010) : le site relaie l'API, les jetons restent en cookies
// HttpOnly. Données synthétiques seulement (example.test, mots de passe aléatoires).

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const ACCESS = '__Host-oz_access';
const REFRESH = '__Host-oz_refresh';

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((animation) => animation.playState === 'finished'),
  );
}

/** Toute requête du navigateur vers l'API trahirait un appel direct, interdit par l'ADR-010. */
function watchApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(API_URL)) calls.push(request.url());
  });
  return calls;
}

async function sessionCookie(context: BrowserContext, name: string) {
  return (await context.cookies(WEB_ORIGIN)).find((cookie) => cookie.name === name);
}

async function signUpAndConfirm(page: Page, email: string, password: string): Promise<void> {
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

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('onboarding-placeholder')).toBeVisible();
}

test.describe('écrans de compte (lot 1.7ca)', () => {
  for (const path of ['/auth/role', '/auth/signup/player', '/auth/login', '/auth/verify-email']) {
    test(`${path} : WCAG 2.1 AA à 320 px, sans défilement horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      expect(violations.map((violation) => violation.id)).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('sans session, /onboarding renvoie à la connexion', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fonboarding$/);
  });

  test('compte → email → connexion → rotation → rejeu → déconnexion', async ({ page, context }) => {
    const apiCalls = watchApiCalls(page);
    const email = syntheticEmail();
    const password = syntheticPassword();

    await signUpAndConfirm(page, email, password);
    await page.getByTestId('verify-login').click();
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fonboarding$/);
    await logIn(page, email, password);
    await expect(page).toHaveURL(/\/onboarding$/);

    // Cookies posés par le site : HttpOnly, Secure, SameSite=Strict ; invisibles au JavaScript.
    for (const name of [ACCESS, REFRESH]) {
      const cookie = await sessionCookie(context, name);
      expect(cookie, name).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
      });
    }
    expect(await page.evaluate(() => document.cookie)).not.toContain('oz_');
    const firstRefresh = (await sessionCookie(context, REFRESH))?.value ?? '';

    // Jeton d'accès disparu : le site renouvelle la session avant le rendu.
    await context.clearCookies({ name: ACCESS });
    await page.reload();
    await expect(page.getByTestId('onboarding-placeholder')).toBeVisible();
    const rotated = (await sessionCookie(context, REFRESH))?.value ?? '';
    expect(rotated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rotated).not.toBe(firstRefresh);
    expect(await sessionCookie(context, ACCESS)).toBeDefined();

    // Rejeu de l'ancien jeton contre l'API : la famille entière est révoquée (E2E n° 8).
    const replay = await page.request.fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { origin: WEB_ORIGIN, cookie: `${REFRESH}=${firstRefresh}` },
    });
    expect(replay.status()).toBe(401);
    await context.clearCookies({ name: ACCESS });
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fonboarding$/);
    expect(await sessionCookie(context, REFRESH)).toBeUndefined();

    // Nouvelle connexion, puis déconnexion : la page protégée renvoie de nouveau à la connexion.
    await logIn(page, email, password);
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(new RegExp(`^${WEB_ORIGIN}/$`));
    expect(await sessionCookie(context, REFRESH)).toBeUndefined();
    expect(await sessionCookie(context, ACCESS)).toBeUndefined();
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/auth\/login/);

    expect(apiCalls).toEqual([]);
  });

  test('identifiants faux : message générique, aucun cookie', async ({ page, context }) => {
    await page.goto('/auth/login');
    await page.getByTestId('login-email').fill(syntheticEmail());
    await page.getByTestId('login-password').fill(syntheticPassword());
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toBeVisible();
    expect(await sessionCookie(context, ACCESS)).toBeUndefined();
  });
});
