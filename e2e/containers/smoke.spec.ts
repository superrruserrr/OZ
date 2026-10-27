import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CONTAINER_URLS } from '../containers.config.js';

const servedNonces = (html: string): string[] =>
  [...html.matchAll(/<script\b[^>]*>/g)].map(([tag]) => /\snonce="([^"]*)"/.exec(tag)?.[1] ?? '');

test.describe('API conteneurisée', () => {
  test('vivacité et disponibilité avec PostgreSQL, Redis et S3', async ({ request }) => {
    const live = await request.get(`${CONTAINER_URLS.api}/health/live`);
    expect(live.status()).toBe(200);
    const health = await request.get(`${CONTAINER_URLS.api}/health`);
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up', storage: 'up' },
    });
  });
});

test.describe('web conteneurisé (HOSTNAME arbitraire, D-013)', () => {
  test('/, /en et /en/ répondent sans boucle de redirection', async ({ request }) => {
    expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(200);
    expect((await request.get('/en', { maxRedirects: 0 })).status()).toBe(200);
    const slash = await request.get('/en/', { maxRedirects: 0 });
    expect(slash.status()).toBe(308);
    expect(slash.headers()['location']).toMatch(/\/en$/);
  });

  test('CSP avec nonce sur chaque script servi, sans violation ni erreur console', async ({
    page,
    request,
  }) => {
    const response = await request.get('/');
    const nonce = /'nonce-([^']+)'/.exec(response.headers()['content-security-policy'] ?? '')?.[1];
    expect(nonce).toBeTruthy();
    for (const value of servedNonces(await response.text())) expect(value).toBe(nonce);

    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(errors).toEqual([]);
  });

  test('aucune violation WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState === 'finished'),
    );
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map(({ id }) => id)).toEqual([]);
  });

  test('404 rendue côté serveur, robots.txt fermé hors production, icône servie', async ({
    request,
  }) => {
    const notFound = await request.get('/foo');
    expect(notFound.status()).toBe(404);
    expect(await notFound.text()).toMatch(/<html[^>]*\slang="fr"/);
    expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow: \//);
    const icon = await request.get('/icon.svg');
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toMatch(/image\/svg\+xml/);
  });
});

test.describe('admin conteneurisé', () => {
  test('non indexable, CSP avec nonce, 404 en français', async ({ request }) => {
    const home = await request.get(`${CONTAINER_URLS.admin}/`);
    expect(home.status()).toBe(200);
    expect(home.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(home.headers()['content-security-policy']).toMatch(/'nonce-[^']+'/);
    const notFound = await request.get(`${CONTAINER_URLS.admin}/nope`);
    expect(notFound.status()).toBe(404);
    expect(await notFound.text()).toContain('Page introuvable');
  });
});
