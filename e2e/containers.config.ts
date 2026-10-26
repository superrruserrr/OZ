import { defineConfig, devices } from '@playwright/test';

// Fumée sur les images réelles (lot 0.8a) : conteneurs lancés par infra/docker/compose.smoke.yml
// (scripts/containers-smoke.sh), avec un HOSTNAME arbitraire comme sous un orchestrateur.
export const CONTAINER_URLS = {
  web: 'http://127.0.0.1:3200',
  api: 'http://127.0.0.1:3201',
  admin: 'http://127.0.0.1:3202',
} as const;

export default defineConfig({
  testDir: 'containers',
  forbidOnly: true,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], baseURL: CONTAINER_URLS.web },
});
