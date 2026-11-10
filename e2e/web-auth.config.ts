import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_ORIGIN } from './auth/api-stack.js';

// Écrans de compte du site (lot 1.7ca, ADR-010) : site de production relié à l'API E2E. Aucune
// trace ni capture : les cookies portent des jetons.
export default defineConfig({
  testDir: 'web-auth',
  testMatch: '*.spec.ts',
  globalSetup: './web-auth/stack.ts',
  outputDir: '../test-results/e2e-web-auth',
  forbidOnly: true,
  reporter: 'line',
  workers: 1,
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_ORIGIN,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'pnpm exec turbo run build --filter=@oz/web && PORT=3100 pnpm --filter @oz/web start',
    url: WEB_ORIGIN,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      HOSTNAME: '127.0.0.1',
      APP_ENV: 'local',
      API_URL,
      APP_URL: WEB_ORIGIN,
    },
  },
});
