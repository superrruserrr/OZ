import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_URL, WEB_ORIGIN } from '../auth/api-stack.js';
import { mailTo, syntheticEmail, syntheticPassword, tokenIn } from '../auth/flows.js';
import {
  ACCESS,
  REFRESH,
  logIn,
  sessionCookie,
  settle,
  signUpAndConfirm,
  useClientAddress,
  watchApiCalls,
} from './helpers.js';

// Écrans de compte (lot 1.7ca, ADR-010) : le site relaie l'API, les jetons restent en cookies
// HttpOnly. Données synthétiques seulement (example.test, mots de passe aléatoires).

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const FIRST_STEP = /\/onboarding\/identite$/;

async function logInToFirstStep(page: Page, email: string, password: string): Promise<void> {
  await logIn(page, email, password);
  await expect(page.getByTestId('onboarding-step-identity')).toBeVisible();
}

test.describe('écrans de compte (lot 1.7ca)', () => {
  for (const path of [
    '/auth/role',
    '/auth/signup/player',
    '/auth/login',
    '/auth/verify-email',
    '/auth/forgot',
    '/auth/reset',
  ]) {
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

  test('renvoi de l’email, puis mot de passe oublié → nouveau mot de passe → connexion (lot 1.7cc)', async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await useClientAddress(page, 21);
    const apiCalls = watchApiCalls(page);
    const email = syntheticEmail();
    const password = syntheticPassword();
    const CONFIRM = 'Confirmez votre adresse email';

    // Création du compte, sans ouvrir le premier lien.
    await page.goto('/auth/signup/player');
    await page.getByTestId('signup-email').fill(email);
    await page.getByTestId('signup-password').fill(password);
    await page.waitForTimeout(3_100);
    await page.getByTestId('signup-submit').click();
    await expect(page.getByTestId('signup-sent')).toBeVisible();
    const first = tokenIn(await mailTo(email, CONFIRM));

    // Renvoi : un nouveau lien arrive, l'ancien ne marche plus.
    await page.getByTestId('signup-resend').click();
    await expect(page.getByTestId('resend-done')).toBeVisible();
    let second = first;
    await expect
      .poll(async () => (second = tokenIn(await mailTo(email, CONFIRM))), { timeout: 20_000 })
      .not.toBe(first);
    await page.goto(`/auth/verify-email#token=${first}`);
    await expect(page.getByTestId('verify-invalid')).toBeVisible();
    await expect(page.getByTestId('verify-resend-email')).toBeVisible();
    await page.goto(`/auth/verify-email#token=${second}`);
    await expect(page.getByTestId('verify-done')).toBeVisible();

    // Mot de passe oublié depuis la connexion : même message que le compte existe ou non.
    await page.getByTestId('verify-login').click();
    await page.getByTestId('login-forgot').click();
    await expect(page).toHaveURL(/\/auth\/forgot$/);
    await page.getByTestId('forgot-email').fill(email);
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-sent')).toBeVisible();
    const reset = tokenIn(await mailTo(email, 'Réinitialisation de votre mot de passe'));

    // Nouveau mot de passe : le jeton quitte l'adresse dès sa lecture.
    await page.goto(`/auth/reset#token=${reset}`);
    await expect(page.getByTestId('reset-password')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    const renewed = syntheticPassword();
    await page.getByTestId('reset-password').fill(renewed);
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('reset-done')).toBeVisible();
    expect(await sessionCookie(context, REFRESH)).toBeUndefined();

    // Le lien ne sert qu'une fois ; l'ancien mot de passe est refusé, le nouveau ouvre la session.
    // Rouvert plus tard, depuis une autre page (chargement complet, comme depuis l'email).
    await page.goto('/auth/login');
    await page.goto(`/auth/reset#token=${reset}`);
    await page.getByTestId('reset-password').fill(syntheticPassword());
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('reset-invalid')).toBeVisible();
    await page.goto('/auth/login');
    await logIn(page, email, password);
    await expect(page.getByTestId('login-error')).toBeVisible();
    await logInToFirstStep(page, email, renewed);
    expect(apiCalls).toEqual([]);
  });

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
    await logInToFirstStep(page, email, password);
    await expect(page).toHaveURL(FIRST_STEP);

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
    await expect(page.getByTestId('onboarding-step-identity')).toBeVisible();
    const rotated = (await sessionCookie(context, REFRESH))?.value ?? '';
    expect(rotated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rotated).not.toBe(firstRefresh);
    expect(await sessionCookie(context, ACCESS)).toBeDefined();

    // Rejeu de l'ancien jeton contre l'API, fenêtre de grâce (10 s, D-132) écoulée : la famille
    // entière est révoquée (E2E n° 8).
    await page.waitForTimeout(10_500);
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
    await logInToFirstStep(page, email, password);
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
