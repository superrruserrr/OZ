import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC émet les métadonnées de décorateurs dont l'injection NestJS a besoin (esbuild ne le fait pas).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: '@oz/api',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
