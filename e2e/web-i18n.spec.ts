import { expect, test } from '@playwright/test';

test.describe('i18n web (EX-004.2, EX-T21.3)', () => {
  test('/ est en français', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('/en est en anglais', async ({ page }) => {
    const response = await page.goto('/en');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('/fr redirige vers / (préfixe seulement pour l’anglais)', async ({ request }) => {
    const response = await request.get('/fr', { maxRedirects: 0 });
    expect([307, 308]).toContain(response.status());
    expect(new URL(response.headers()['location'] ?? '', 'http://x').pathname).toBe('/');
  });

  test('une langue inconnue renvoie 404', async ({ request }) => {
    expect((await request.get('/de')).status()).toBe(404);
  });

  test('un navigateur anglophone reste sur / sans cookie de langue', async ({ request }) => {
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['set-cookie'] ?? '').not.toMatch(/NEXT_LOCALE/);
  });
});
