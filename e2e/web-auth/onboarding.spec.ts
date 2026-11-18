import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { syntheticEmail, syntheticPassword } from '../auth/flows.js';
import { logIn, settle, signUpAndConfirm, useClientAddress, watchApiCalls } from './helpers.js';
import {
  bornYearsAgo,
  choose,
  confirmAffiliation,
  fillIdentity,
  fillSport,
  startOnboarding,
} from './onboarding-steps.js';

// Parcours d'inscription joueur (lot 1.7cb, EX-107 n° 7 et 8) : majeur, mineur, reprise, 3G
// simulée. Le site relaie l'API (ADR-010) ; données synthétiques seulement.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function completeAndSeeCard(page: Page): Promise<void> {
  await page.getByTestId('onboarding-complete').click();
  await expect(page.getByTestId('oz-id-card')).toBeVisible();
  // E2 : l'OZ ID complet est rendu pour les lecteurs d'écran pendant que la frappe s'anime.
  await expect(page.getByTestId('oz-id-card-value')).toContainText(
    /OZ-CM-\d{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]/,
  );
  await expect(page.getByTestId('badge-declared')).toHaveText('Déclaré');
  await expect(page.getByTestId('onboarding-completeness')).toHaveText(/^Profil complété à \d+ %$/);
}

test.describe('parcours d’inscription joueur (lot 1.7cb)', () => {
  test('majeur : identité → sport → rattachement → OZ ID, sans étape tuteur', async ({ page }) => {
    await useClientAddress(page, 11);
    const apiCalls = watchApiCalls(page);
    await startOnboarding(page);
    await expect(page.getByTestId('onboarding-progress-counter')).toHaveText('1 / 4');
    await fillIdentity(page, bornYearsAgo(24));
    await fillSport(page);
    await confirmAffiliation(page, /\/onboarding\/oz-id$/);

    // Le tuteur n'existe pas pour un majeur, même par adresse directe.
    await page.goto('/onboarding/tuteur');
    await expect(page).toHaveURL(/\/onboarding\/oz-id$/);
    await expect(page.getByTestId('onboarding-progress-counter')).toHaveText('4 / 4');
    await completeAndSeeCard(page);

    // Inscription finalisée : le parcours n'est plus proposé.
    await page.goto('/onboarding/identite');
    // Lot 1.19b : l'inscription finie mène à l'espace du joueur.
    await expect(page).toHaveURL(/\/espace$/);
    await expect(page.getByTestId('espace-home')).toBeVisible();

    // D-133 : la carte et son QR sont relus sur l'API, donc présents après un rechargement.
    const OZ_ID = /OZ-CM-\d{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]/;
    await expect(page.getByTestId('onboarding-own-card')).toContainText(OZ_ID);
    await page.reload();
    await expect(page.getByTestId('onboarding-own-card')).toContainText(OZ_ID);
    await expect(page.getByTestId('oz-id-qr')).toBeVisible();
    await expect(page.getByTestId('badge-declared')).toHaveText('Déclaré');
    await settle(page);
    const own = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(own.violations.map((violation) => violation.id)).toEqual([]);
    expect(apiCalls).toEqual([]);
  });

  test('tableau de bord (lot 1.5ec) : données réelles, aptitudes vides, 320 px sans défilement', async ({
    page,
  }) => {
    await useClientAddress(page, 15);
    await startOnboarding(page);
    await fillIdentity(page, bornYearsAgo(22));
    await fillSport(page);
    await confirmAffiliation(page, /\/onboarding\/oz-id$/);
    await completeAndSeeCard(page);

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/espace');
    await expect(page.getByTestId('player-dashboard')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Awa');
    const completeness = page.getByRole('figure', { name: 'Complétude de ta fiche par rubrique' });
    await expect(completeness).toHaveAttribute('data-state', 'filled');
    const aptitudes = page.getByRole('figure', { name: 'Aptitudes' });
    await expect(aptitudes).toHaveAttribute('data-state', 'empty');
    await expect(aptitudes).not.toContainText(/\d/);
    const soon = page.getByTestId('coming-soon').getByRole('listitem');
    await expect(soon.first()).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('coming-soon').getByRole('link')).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
  });

  test('mineur : bloc E6 à la saisie, tuteur exigé avant l’OZ ID', async ({ page }) => {
    await useClientAddress(page, 12);
    const apiCalls = watchApiCalls(page);
    await page.setViewportSize({ width: 320, height: 720 });
    await startOnboarding(page);
    await page.getByTestId('onboarding-birth-date').fill(bornYearsAgo(15));
    await expect(page.getByTestId('onboarding-minor-notice')).toBeVisible();
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);

    await fillIdentity(page, bornYearsAgo(15));
    await fillSport(page);
    await confirmAffiliation(page, /\/onboarding\/tuteur$/);
    await expect(page.getByTestId('onboarding-progress-counter')).toHaveText('4 / 5');

    // Bloquant : la finalisation renvoie au tuteur tant qu'il manque.
    await page.goto('/onboarding/oz-id');
    await expect(page).toHaveURL(/\/onboarding\/tuteur$/);
    await page.getByTestId('onboarding-guardian-first-name').fill('Mariam');
    await page.getByTestId('onboarding-guardian-last-name').fill('Ndiaye');
    await choose(page, 'onboarding-guardian-relationship', 'Mère');
    await choose(page, 'onboarding-guardian-country', 'Cameroun');
    await page.getByTestId('onboarding-submit').click();
    await expect(page.getByText('Indiquez un téléphone ou un email.')).toBeVisible();
    await page.getByTestId('onboarding-guardian-phone').fill('+237690000001');
    await page.getByTestId('onboarding-submit').click();
    await expect(page).toHaveURL(/\/onboarding\/oz-id$/);
    await completeAndSeeCard(page);
    await settle(page);
    const card = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(card.violations.map((violation) => violation.id)).toEqual([]);
    expect(apiCalls).toEqual([]);
  });

  test('reprise : déconnexion après le sport, reconnexion à l’étape suivante', async ({ page }) => {
    await useClientAddress(page, 13);
    const apiCalls = watchApiCalls(page);
    const email = syntheticEmail();
    const password = syntheticPassword();
    await signUpAndConfirm(page, email, password);
    await page.getByTestId('verify-login').click();
    await logIn(page, email, password);
    await fillIdentity(page, bornYearsAgo(20));
    await fillSport(page);

    await page.getByTestId('logout').click();
    await page.goto('/auth/login');
    await logIn(page, email, password);
    await expect(page).toHaveURL(/\/onboarding\/rattachement$/);
    await expect(page.getByTestId('onboarding-resume')).toBeVisible();

    // Les étapes enregistrées sont relues sur le serveur.
    await page.getByTestId('onboarding-progress-back').click();
    await expect(page).toHaveURL(/\/onboarding\/physique$/);
    await expect(page.getByTestId('onboarding-primary-position')).toHaveText(/Attaquant/);
    await expect(page.getByTestId('onboarding-height')).toHaveValue('178');
    expect(apiCalls).toEqual([]);
  });

  test('3G simulée : le parcours majeur aboutit (EX-107 n° 7)', async ({ page, context }) => {
    test.setTimeout(240_000);
    await useClientAddress(page, 14);
    const apiCalls = watchApiCalls(page);
    await startOnboarding(page);
    // Profil « Fast 3G » de Chrome DevTools : 562,5 ms de latence, 1,44 Mbit/s descendant.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 562.5,
      downloadThroughput: 180_000,
      uploadThroughput: 84_375,
    });
    await page.reload();
    await fillIdentity(page, bornYearsAgo(30));
    await fillSport(page);
    await confirmAffiliation(page, /\/onboarding\/oz-id$/);
    await completeAndSeeCard(page);
    expect(apiCalls).toEqual([]);
  });
});
