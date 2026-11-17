import { expect, test } from '@playwright/test';

// Audit final de la refonte « sport » (lot 1.5cbb, EX-T22) : quatre largeurs de référence, pages
// publiques et écrans de compte. axe-core et 3G sont dans `web-audit.spec.ts` (320 px).

const WIDTHS = [1280, 768, 375, 320] as const;
const PAGES = [
  ['/', 'site-home-link'],
  ['/tarifs', 'site-home-link'],
  ['/legal/cgu', 'site-home-link'],
  ['/auth/login', 'auth-home-link'],
  ['/auth/role', 'auth-home-link'],
  ['/auth/signup/player', 'auth-home-link'],
] as const;

for (const width of WIDTHS) {
  for (const [path, brand] of PAGES) {
    test(`${path} à ${String(width)} px : en-tête visible, aucun défilement horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByTestId(brand).first()).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test('écrans de compte : l’accroche n’apparaît qu’à partir de 1024 px (D1)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/auth/login');
  await expect(page.getByTestId('auth-aside')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('auth-aside')).toBeVisible();
});
