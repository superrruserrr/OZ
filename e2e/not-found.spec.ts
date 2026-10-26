import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_URL } from './playwright.config.js';

const CASES = [
  { base: undefined, path: '/foo', lang: 'fr', title: 'Page introuvable', home: '/' },
  { base: undefined, path: '/en/foo', lang: 'en', title: 'Page not found', home: '/en' },
  { base: undefined, path: '/de', lang: 'fr', title: 'Page introuvable', home: '/' },
  { base: ADMIN_URL, path: '/nope', lang: 'fr', title: 'Page introuvable', home: '/' },
] as const;

for (const { base, path, lang, title, home } of CASES) {
  test.describe(`404 ${base === ADMIN_URL ? 'admin' : 'web'} ${path}`, () => {
    if (base) test.use({ baseURL: base });

    test('rendue côté serveur : lisible sans JavaScript, langue et titre traduits', async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      const html = await response.text();
      expect(html).not.toContain('__next_error__');
      expect(html).toMatch(new RegExp(`<html[^>]*\\slang="${lang}"`));
      expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
      expect(html).toMatch(new RegExp(`<title>${title}[^<]*</title>`));
      expect(html).toMatch(new RegExp(`<a[^>]*href="${home}"`));
    });

    test('sans violation WCAG AA ni CSP', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.goto(path, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(violations.map(({ id }) => id)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
