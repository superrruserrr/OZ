import { defineConfig } from '@playwright/test';
import { API_URL } from './auth/api-stack.js';

// Parcours E2E de l'API (lot 1.3b, D4) : pile démarrée par Testcontainers, sans navigateur. Aucune
// trace ni capture conservée : les réponses portent des jetons.
export default defineConfig({
  testDir: 'auth',
  globalSetup: './auth/api-stack.ts',
  // Hors de e2e/test-results/, publié par la CI en cas d'échec.
  outputDir: '../test-results/e2e-api',
  forbidOnly: true,
  reporter: 'line',
  timeout: 60_000,
  use: { baseURL: API_URL, trace: 'off', screenshot: 'off', video: 'off' },
});
