// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from './sitemap';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sitemap (lot 1.6, EX-106 n° 2 et 3)', () => {
  it('production : pages publiques en fr et en, aucun profil de joueur', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://oz.example.test');
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain('https://oz.example.test/');
    expect(urls).toContain('https://oz.example.test/legal/cgu');
    expect(urls).toContain('https://oz.example.test/profils/tuteur');
    expect(urls.some((url) => url.includes('/joueur/'))).toBe(false);
    expect(entries[0]?.alternates?.languages).toEqual({
      fr: 'https://oz.example.test/',
      en: 'https://oz.example.test/en',
    });
  });

  it.each([
    ['staging', 'https://oz.example.test'],
    ['production', ''],
  ])('vide en %s ou sans APP_URL', (env, url) => {
    vi.stubEnv('APP_ENV', env);
    vi.stubEnv('APP_URL', url);
    expect(sitemap()).toEqual([]);
  });
});
