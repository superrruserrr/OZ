import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** axe mesure le contraste à l'instant T : attendre la fin des animations d'entrée (état final). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState === 'finished'),
  );
}

for (const path of ['/', '/en']) {
  test(`${path} : aucune violation WCAG 2.1 AA (axe-core, EX-T22.1)`, async ({ page }) => {
    await page.goto(path);
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(violations.map(({ id, nodes }) => `${id} (${String(nodes.length)})`)).toEqual([]);
  });
}

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
      expect(box.height, await link.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test('le lien d’évitement apparaît au clavier et mène au contenu', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByTestId('home-skip-link');
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
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
