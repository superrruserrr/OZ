import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Nonce de chaque `<script>` du HTML servi. Les scripts insérés ensuite par Next (strict-dynamic)
 * n'en portent pas : seul le document rendu par le serveur fait foi.
 */
function servedScriptNonces(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/g)].map(
    ([tag]) => /\snonce="([^"]*)"/.exec(tag)?.[1] ?? '',
  );
}

test.describe('CSP et en-têtes de sécurité (EX-T17.2)', () => {
  test('la page porte la CSP avec nonce et les en-têtes du §6.5', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['content-security-policy']).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers['content-security-policy']).not.toMatch(/unsafe-(inline|eval)/);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe('camera=(self), microphone=(), geolocation=()');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('chaque script servi porte le nonce de la requête', async ({ request }) => {
    const response = await request.get('/');
    const nonce = /'nonce-([^']+)'/.exec(response.headers()['content-security-policy'] ?? '')?.[1];
    expect(nonce).toBeTruthy();
    const nonces = servedScriptNonces(await response.text());
    expect(nonces.length).toBeGreaterThan(0);
    for (const value of nonces) expect(value).toBe(nonce);
  });

  test('deux requêtes reçoivent deux nonces différents', async ({ request }) => {
    const nonces = await Promise.all(
      [1, 2].map(
        async () =>
          /'nonce-([^']+)'/.exec(
            (await request.get('/')).headers()['content-security-policy'] ?? '',
          )?.[1],
      ),
    );
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  test('aucune violation CSP ni erreur console sur / et /en', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of ['/', '/en']) await page.goto(path, { waitUntil: 'networkidle' });
    expect(errors).toEqual([]);
  });

  test('les fichiers statiques gardent nosniff', async ({ page, request }) => {
    await page.goto('/');
    const css = await page.locator('link[rel="stylesheet"]').first().getAttribute('href');
    expect(css).toBeTruthy();
    expect((await request.get(css ?? '')).headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('aucune page servie sans CSP (revue adversariale)', () => {
  for (const path of ['/en/foo.bar', '/apiculture', '/fr/x']) {
    test(`${path} porte la CSP, le nonce sur chaque script, sans violation`, async ({
      page,
      request,
    }) => {
      const response = await request.get(path);
      const nonce = /'nonce-([^']+)'/.exec(
        response.headers()['content-security-policy'] ?? '',
      )?.[1];
      expect(nonce).toBeTruthy();
      for (const value of servedScriptNonces(await response.text())) expect(value).toBe(nonce);

      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(errors).toEqual([]);
    });
  }

  test('aucune page localisée n’est pré-rendue (un nonce exige le rendu à la requête)', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../apps/web/.next/prerender-manifest.json', import.meta.url), 'utf8'),
    ) as { routes: Record<string, unknown> };
    expect(Object.keys(manifest.routes).filter((route) => /^\/(fr|en)(\/|$)/.test(route))).toEqual(
      [],
    );
  });
});
