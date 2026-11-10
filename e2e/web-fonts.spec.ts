import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const root = new URL('../', import.meta.url);
const sha256 = (url: URL): string => createHash('sha256').update(readFileSync(url)).digest('hex');

// Seuls Prompt 400/700 et JetBrains Mono, sous-ensembles latin et latin-ext (design.md §8.5, EX-T22).
const ALLOWED = [
  '@fontsource/prompt/files/prompt-latin-400-normal.woff2',
  '@fontsource/prompt/files/prompt-latin-700-normal.woff2',
  '@fontsource/prompt/files/prompt-latin-ext-400-normal.woff2',
  '@fontsource/prompt/files/prompt-latin-ext-700-normal.woff2',
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2',
].map((file) => sha256(new URL(`apps/web/node_modules/${file}`, root)));

test('le build n’émet que les polices latin et latin-ext autorisées', () => {
  const media = new URL('apps/web/.next/static/media/', root);
  const fonts = readdirSync(media).filter((name) => name.endsWith('.woff2'));
  expect(fonts.length).toBeGreaterThan(0);
  for (const name of fonts) expect(ALLOWED, name).toContain(sha256(new URL(name, media)));
});

test('la page d’accueil charge ses polices du même domaine, 200 Ko au plus (3G)', async ({
  page,
}) => {
  const fonts: { url: string; size: number }[] = [];
  page.on('response', async (response) => {
    if (response.request().resourceType() !== 'font') return;
    fonts.push({ url: response.url(), size: (await response.body()).length });
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  expect(fonts.length).toBeGreaterThan(0);
  for (const { url } of fonts) expect(new URL(url).origin, url).toBe(new URL(page.url()).origin);
  expect(fonts.reduce((total, { size }) => total + size, 0)).toBeLessThanOrEqual(200 * 1024);
});
