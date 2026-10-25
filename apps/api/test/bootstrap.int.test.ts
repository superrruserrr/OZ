import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { runMain } from '../src/main.js';
import { testConfig, validEnv } from './support.js';

describe('amorçage de l’API (EX-003 n° 1)', () => {
  it('refuse de démarrer avec une configuration invalide, en nommant les variables sans leurs valeurs', async () => {
    const written: string[] = [];
    let started = false;
    const code = await runMain(
      { ...validEnv, DATABASE_URL: 'valeur-secrete-xyz', API_PORT: 'abc' },
      {
        stderr: (text) => written.push(text),
        start: () => {
          started = true;
          return Promise.resolve();
        },
      },
    );
    expect(code).toBe(1);
    expect(started).toBe(false);
    expect(written.join('')).toMatch(/API_PORT/);
    expect(written.join('')).toMatch(/DATABASE_URL/);
    expect(written.join('')).not.toContain('valeur-secrete-xyz');
  });

  it('démarre avec une configuration valide et répond en HTTP', async () => {
    const app = await createApp(testConfig());
    await app.init();
    const response = await request(app.getHttpServer()).get('/route-inexistante');
    expect(response.status).toBe(404);
    await app.close();
  });
});
