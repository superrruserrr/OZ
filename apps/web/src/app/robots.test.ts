// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import robots, { dynamic } from './robots';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots.txt du site public', () => {
  it('autorise l’indexation en production seulement', () => {
    vi.stubEnv('APP_ENV', 'production');
    expect(robots().rules).toEqual({ userAgent: '*', allow: '/' });
  });

  it.each(['staging', 'preview', 'local'])('interdit toute indexation en %s (R10)', (env) => {
    vi.stubEnv('APP_ENV', env);
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' });
  });

  it('est calculé au démarrage, pas figé au build (une image pour tous les environnements)', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
