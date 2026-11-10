import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';

// Ralentit le processeur de la page par CDP (Emulation.setCPUThrottlingRate), comme un Android
// d'entrée de gamme (lot 1.5bb, design.md §8.11 n° 5).
const throttleCpu: BrowserCommand<[rate: number]> = async (context, rate) => {
  const session = await context.page.context().newCDPSession(context.page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
};

/*
 * `pnpm --filter @oz/ui test:perf` : coût de chaque effet en boucle, en images par seconde, dans
 * Chromium sans mouvement réduit. Hors CI (résultat dépendant de la machine) ; mesures consignées
 * dans docs/ui/effets.md.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    name: 'perf',
    include: ['src/**/*.perf.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      commands: { throttleCpu },
    },
  },
});
