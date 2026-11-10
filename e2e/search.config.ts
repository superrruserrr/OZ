import { defineConfig } from '@playwright/test';
import { API_URL } from './auth/api-stack.js';

// Parcours E2E de la recherche (lot 1.14a, §7.5 n° 4) : API compilée contre PostgreSQL, Redis et
// Mailpit jetables, sans worker. Aucune trace ni capture : les réponses portent des jetons.
export default defineConfig({
  testDir: 'search',
  testMatch: '*.spec.ts',
  globalSetup: './auth/api-stack.ts',
  outputDir: '../test-results/e2e-search',
  forbidOnly: true,
  reporter: 'line',
  workers: 1,
  timeout: 120_000,
  use: { baseURL: API_URL, trace: 'off', screenshot: 'off', video: 'off' },
});
