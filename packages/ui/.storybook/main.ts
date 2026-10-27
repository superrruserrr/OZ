import type { StorybookConfig } from '@storybook/react-vite';

// Storybook 10 (TD-020) : vitrine et banc d'essai du design system (lot 0.10, EX-010).
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  // Aucune donnée d'usage envoyée (R12).
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import('vite');
    const tailwindcss = (await import('@tailwindcss/vite')).default;
    return mergeConfig(viteConfig, { plugins: [tailwindcss()] });
  },
};

export default config;
