import { defineConfig, devices } from '@playwright/test';

// Fumée navigateur sur le build de production (lot 0.4) : ports dédiés, jamais ceux du développement.
// Turbo reconstruit d'abord les paquets partagés (@oz/config, @oz/ui) : jamais un dist périmé.
export const WEB_URL = 'http://localhost:3100';
export const ADMIN_URL = 'http://localhost:3102';

export default defineConfig({
  testDir: '.',
  // Specs des conteneurs : lancées par `pnpm test:containers` (e2e/containers.config.ts).
  testIgnore: ['containers/**'],
  fullyParallel: true,
  forbidOnly: true,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
  webServer: [
    {
      command:
        'pnpm exec turbo run build --filter=@oz/web && PORT=3100 pnpm --filter @oz/web start',
      url: WEB_URL,
      timeout: 240_000,
      reuseExistingServer: false,
      // HOSTNAME hérité comme dans un conteneur Docker (identifiant du conteneur) : le script start
      // doit l'écraser, sinon `/` boucle en redirection (revue du lot 0.4).
      env: { NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', APP_ENV: 'local' },
    },
    {
      command:
        'pnpm exec turbo run build --filter=@oz/admin && PORT=3102 pnpm --filter @oz/admin start',
      url: ADMIN_URL,
      timeout: 240_000,
      reuseExistingServer: false,
      // HOSTNAME hérité comme dans un conteneur Docker (identifiant du conteneur) : le script start
      // doit l'écraser, sinon `/` boucle en redirection (revue du lot 0.4).
      env: { NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', APP_ENV: 'local' },
    },
  ],
});
