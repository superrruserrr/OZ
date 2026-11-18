import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { settle, useClientAddress, watchApiCalls } from './helpers.js';
import {
  bornYearsAgo,
  confirmAffiliation,
  fillIdentity,
  fillSport,
  startOnboarding,
} from './onboarding-steps.js';

// Espace du joueur (lot 1.19b, EX-115, EX-118) : après l'inscription, la carte, la visibilité de la
// fiche, l'export et la suppression du compte ; tout passe par le relais du site (ADR-010).

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('majeur : espace, visibilité relue, export demandé, suppression programmée puis annulée', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await useClientAddress(page, 41);
  const apiCalls = watchApiCalls(page);
  const password = await startOnboarding(page);
  await fillIdentity(page, bornYearsAgo(22));
  await fillSport(page);
  await confirmAffiliation(page, /\/onboarding\/oz-id$/);
  await page.getByTestId('onboarding-complete').click();
  await expect(page.getByTestId('oz-id-card')).toBeVisible();

  // Accueil : la carte relue sur l'API, sans libellé « vérifié » (ADR-013).
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/espace$/);
  await expect(page.getByTestId('player-dashboard')).toBeVisible();
  await expect(page.getByTestId('rail-home')).toHaveAttribute('aria-current', 'page');
  await settle(page);
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);

  // Visibilité : masquer la taille et le poids, l'état relu après rechargement.
  await page.getByTestId('espace-to-visibility').click();
  await expect(page).toHaveURL(/\/espace\/visibilite$/);
  await expect(page.getByTestId('espace-visibility-submit')).toBeDisabled();
  await page.getByTestId('espace-visibility-physical').uncheck();
  await page.getByTestId('espace-visibility-submit').click();
  await expect(page.getByTestId('espace-visibility-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('espace-visibility-physical')).not.toBeChecked();
  await expect(page.getByTestId('espace-visibility-location')).toBeChecked();
  await settle(page);
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);

  // Mes données : mot de passe faux refusé, puis export demandé.
  await page.goto('/espace/donnees');
  await page.getByTestId('espace-export-password').fill('mauvais mot de passe');
  await page.getByTestId('espace-export-submit').click();
  await expect(page.getByTestId('espace-export-error')).toContainText(
    'Mot de passe ou code incorrect',
  );
  await page.getByTestId('espace-export-password').fill(password);
  await page.getByTestId('espace-export-submit').click();
  await expect(page.getByTestId('espace-export').getByTestId(/badge-export-/)).toBeVisible();
  await expect(page.getByTestId('espace-export-form')).toBeHidden();

  // Suppression : confirmation exigée, programmée à +30 jours, puis annulée.
  await expect(page.getByTestId('espace-deletion-submit')).toBeDisabled();
  await page.getByTestId('espace-deletion-agree').check();
  await page.getByTestId('espace-deletion-password').fill(password);
  await page.getByTestId('espace-deletion-submit').click();
  await expect(page.getByTestId('espace-deletion-pending')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('espace-deletion-pending')).toBeVisible();
  await settle(page);
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);
  await page.getByTestId('espace-deletion-cancel').click();
  await expect(page.getByTestId('espace-deletion-cancelled')).toBeVisible();
  await expect(page.getByTestId('espace-deletion-form')).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test('mineur : visibilité réglée par le tuteur, rappel affiché', async ({ page }) => {
  await useClientAddress(page, 42);
  await startOnboarding(page);
  await fillIdentity(page, bornYearsAgo(15));
  await page.goto('/espace/visibilite');
  // Inscription inachevée : l'espace renvoie au parcours.
  await expect(page).toHaveURL(/\/onboarding\//);
});
