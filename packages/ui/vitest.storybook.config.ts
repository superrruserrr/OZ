import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Maintient le bouton de la souris enfoncé sur un élément (`:active`), ce que `userEvent` ne sait pas faire.
const pressAndHold: BrowserCommand<[testId: string]> = async (context, testId) => {
  await context.iframe.getByTestId(testId).hover();
  await context.page.mouse.down();
};
const releaseMouse: BrowserCommand = async (context) => {
  await context.page.mouse.up();
};

/*
 * `pnpm --filter @oz/ui test:stories` (lot 0.10, EX-T22) : chaque story rendue dans Chromium sans
 * affichage, interactions `play` et contrôle axe-core WCAG 2.1 AA bloquant (`a11y.test: 'error'`).
 * Le projet `motion` rejoue Button et Field sous `prefers-reduced-motion: reduce`. Hors de
 * `pnpm test` : le job `test` de la CI n'a pas de navigateur.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['./.storybook/vitest.setup.ts'],
        },
      },
      {
        plugins: [react(), tailwindcss()],
        test: {
          name: 'motion',
          include: ['src/**/*.browser.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ contextOptions: { reducedMotion: 'reduce' } }),
            instances: [{ browser: 'chromium' }],
            commands: { pressAndHold, releaseMouse },
          },
        },
      },
    ],
  },
});
