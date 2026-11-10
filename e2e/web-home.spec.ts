import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** axe mesure le contraste à l'instant T : attendre la fin des animations d'entrée (état final). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      // Les boucles (flottement des puces, E20) ne finissent jamais : seules les entrées comptent.
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((animation) => animation.playState === 'finished'),
  );
}

for (const [path, colorScheme] of [
  ['/', 'light'],
  ['/en', 'light'],
  ['/', 'dark'],
] as const) {
  test(`${path} en mode ${colorScheme} : aucune violation WCAG 2.1 AA (axe-core, EX-T22.1)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(path);
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(violations.map(({ id, nodes }) => `${id} (${String(nodes.length)})`)).toEqual([]);
  });
}

test('logo de la charte : version fond sombre en mode sombre, empilée sur mobile (ADR-009)', async ({
  page,
}) => {
  const logo = page.getByTestId('oz-logo').locator('img');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(logo).toHaveJSProperty('complete', true);
  expect(await logo.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain(
    'oz-logo-horizontal-fond-sombre.png',
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await logo.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain(
    'oz-logo-empile-fond-clair.png',
  );
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test.describe('à 320 px de large (EX-T22.2)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('aucun défilement horizontal', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('les liens visibles offrent une cible tactile d’au moins 44 px', async ({ page }) => {
    await page.goto('/');
    for (const link of await page.getByRole('link').all()) {
      const box = await link.boundingBox();
      // Masqué visuellement (lien d'évitement hors focus) : mesuré dans le test suivant.
      if (!box || box.width <= 1) continue;
      // Arrondi au centième : la mise en page rend parfois 43,99997 px pour une hauteur de 44 px.
      expect(Math.round(box.height * 100) / 100, await link.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test('le lien d’évitement apparaît au clavier et mène au contenu', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByTestId('home-skip-link');
    await expect(skip).toBeFocused();
    expect(
      Math.round(((await skip.boundingBox())?.height ?? 0) * 100) / 100,
    ).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
});

test('le sélecteur de langue mène de / à /en et retour', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('locale-switcher-en').click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByTestId('locale-switcher-fr').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});
