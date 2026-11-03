import { defineConfig } from '@playwright/test';
import { API_URL } from './auth/api-stack.js';

// Parcours E2E du coffre documentaire (lot 1.9cb, §7.5 n° 10) : API et worker compilés, contre
// PostgreSQL, Redis, S3, Mailpit et ClamAV jetables. Aucune trace ni capture : les réponses portent
// des jetons et des URL signées.
export default defineConfig({
  testDir: 'documents',
  testMatch: '*.spec.ts',
  globalSetup: './documents/stack.ts',
  outputDir: '../test-results/e2e-documents',
  forbidOnly: true,
  reporter: 'line',
  timeout: 180_000,
  use: { baseURL: API_URL, trace: 'off', screenshot: 'off', video: 'off' },
});
