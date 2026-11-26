import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { logIn, settle, useClientAddress, watchApiCalls } from './helpers.js';
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
  const { email, password } = await startOnboarding(page);
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

  // Navigation de la maquette v2 : chaque entrée du rail ouvre une vraie page, sans faux chiffre.
  const rail = {
    profile: [/\/espace\/profil$/, 'Awa Ndiaye'],
    performances: [/\/espace\/performances$/, 'Mes performances'],
    videos: [/\/espace\/videos$/, 'Mes vidéos'],
    messages: [/\/espace\/messages$/, 'Messages'],
    settings: [/\/espace\/donnees$/, null],
    home: [/\/espace$/, null],
  } as const;
  for (const [id, [url, title]] of Object.entries(rail)) {
    await page.getByTestId(`rail-${id}`).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId(`rail-${id}`)).toHaveAttribute('aria-current', 'page');
    if (title) await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await settle(page);
    expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);
  }

  // Visibilité : masquer la taille et le poids, l'état relu après rechargement.
  await page.getByTestId('dashboard-to-visibility').click();
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
  // La demande ferme toutes les sessions (D1 du lot 1.16ca) : reconnexion pour annuler.
  await page.reload();
  await expect(page).toHaveURL(/\/auth\/login/);
  await logIn(page, email, password);
  // Le retour vers l'écran demandé (`next`) vaut preuve de la connexion.
  await expect(page).toHaveURL(/\/espace\/donnees$/);
  await expect(page.getByTestId('espace-deletion-pending')).toBeVisible();
  await settle(page);
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);
  await page.getByTestId('espace-deletion-cancel').click();
  await expect(page.getByTestId('espace-deletion-cancelled')).toBeVisible();
  await expect(page.getByTestId('espace-deletion-form')).toBeVisible();

  // Recherche de joueurs depuis l'en-tête (lot 1.19c) : l'annuaire répond dans la portée réduite.
  await page.getByRole('searchbox').fill('Zzzinconnu');
  await page.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/\/recherche\?q=Zzzinconnu$/);
  await expect(page.getByTestId('player-search-forbidden')).toBeHidden();

  // Déconnexion par le menu de l'avatar : Échap le ferme et rend le focus.
  await page.goto('/espace');
  const avatar = page.getByTestId('espace-avatar');
  await avatar.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('espace-avatar-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('espace-avatar-menu')).toBeHidden();
  await expect(avatar).toBeFocused();
  await avatar.click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/espace');
  await expect(page).toHaveURL(/\/auth\/login/);
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
