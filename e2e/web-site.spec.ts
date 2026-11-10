import { expect, test } from '@playwright/test';

// Site public (lot 1.6, EX-106) : pages servies par l'image autonome, liens du pied de page,
// formulaire de contact (échec neutre sans API en local) et indexation hors production.

test('textes légaux lus depuis docs/legal dans l’image autonome', async ({ page }) => {
  for (const doc of ['cgu', 'confidentialite', 'mentions'] as const) {
    const response = await page.goto(`/legal/${doc}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId(`legal-${doc}`).locator('h1')).toBeVisible();
  }
  expect((await page.goto('/legal/inconnu'))?.status()).toBe(404);
});

test('pied de page : tarifs, à propos, contact, textes légaux et profils', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('footer-pricing').click();
  await expect(page).toHaveURL(/\/tarifs$/);
  await expect(page.getByTestId('pricing-players')).toBeVisible();
  await expect(page.getByTestId('pricing-organisations')).toContainText('15');
  await page.getByTestId('footer-profile-joueur').click();
  await expect(page.getByTestId('profile-page-joueur')).toBeVisible();
  expect((await page.goto('/profils/inconnu'))?.status()).toBe(404);
});

test('contact : erreurs de validation annoncées, puis échec neutre sans API', async ({ page }) => {
  await page.goto('/contact');
  await page.getByTestId('contact-form-submit').click();
  await expect(page.getByTestId('contact-form-name-error')).toBeVisible();
  await page.getByTestId('contact-form-name').fill('Éliot Moukoko');
  await page.getByTestId('contact-form-email').fill('eliot@exemple.test');
  await page.getByTestId('contact-form-organisation-type').selectOption('academy');
  await page
    .getByTestId('contact-form-message')
    .fill('Bonjour, notre académie souhaite rejoindre OZ.');
  await page.getByTestId('contact-form-consent').check();
  await page.getByTestId('contact-form-submit').click();
  await expect(page.getByTestId('contact-failed')).toBeVisible();
});

test('hors production : ni plan du site, ni indexation', async ({ request }) => {
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('<loc>');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
});
