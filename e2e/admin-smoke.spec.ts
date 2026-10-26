import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_URL } from './playwright.config.js';

/**
 * Nonce de chaque `<script>` du HTML servi. Les scripts insérés ensuite par Next (strict-dynamic)
 * n'en portent pas : seul le document rendu par le serveur fait foi.
 */
function servedScriptNonces(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/g)].map(
    ([tag]) => /\snonce="([^"]*)"/.exec(tag)?.[1] ?? '',
  );
}

test.describe('back-office (squelette)', () => {
  test.use({ baseURL: ADMIN_URL });

  test('n’est pas indexable (en-tête et balise meta)', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('porte la CSP avec nonce, appliqué à chaque script, sans erreur console', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const response = await page.goto('/', { waitUntil: 'networkidle' });
    const nonce = /'nonce-([^']+)'/.exec(response?.headers()['content-security-policy'] ?? '')?.[1];
    expect(nonce).toBeTruthy();
    const nonces = servedScriptNonces((await response?.text()) ?? '');
    expect(nonces.length).toBeGreaterThan(0);
    for (const value of nonces) expect(value).toBe(nonce);
    expect(errors).toEqual([]);
  });

  test('aucune violation WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map(({ id }) => id)).toEqual([]);
  });
});

test('le back-office n’est pas pré-rendu (nonce par requête)', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../apps/admin/.next/prerender-manifest.json', import.meta.url), 'utf8'),
  ) as { routes: Record<string, unknown> };
  expect(Object.keys(manifest.routes)).not.toContain('/');
});
