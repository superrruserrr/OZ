// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import robots, { dynamic } from './robots';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots.txt du site public', () => {
  it('production : pages publiques indexables, profils de joueurs et API jamais ; plan du site', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://oz.example.test');
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/joueur/', '/en/joueur/', '/api/'] },
      sitemap: 'https://oz.example.test/sitemap.xml',
    });
  });

  it.each(['staging', 'preview', 'local'])('interdit toute indexation en %s (R10)', (env) => {
    vi.stubEnv('APP_ENV', env);
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' });
  });

  it('est calculé au démarrage, pas figé au build (une image pour tous les environnements)', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
