import { defineConfig } from '@playwright/test';
import { API_URL } from './auth/api-stack.js';

// Parcours E2E des droits RGPD (lot 1.16cbb, §7.5 n° 9) : API et worker compilés, contre
// PostgreSQL, Redis, S3 et Mailpit jetables. Aucune trace ni capture : les réponses portent des
// jetons et des URL signées.
export default defineConfig({
  testDir: 'gdpr',
  testMatch: '*.spec.ts',
  globalSetup: './gdpr/stack.ts',
  outputDir: '../test-results/e2e-gdpr',
  forbidOnly: true,
  reporter: 'line',
  workers: 1,
  timeout: 180_000,
  use: { baseURL: API_URL, trace: 'off', screenshot: 'off', video: 'off' },
});
