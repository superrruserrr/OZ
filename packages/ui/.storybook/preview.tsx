import type { Preview } from '@storybook/react-vite';
import { ozTheme } from './oz-theme.js';
import './storybook.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { theme: ozTheme },
    // Fond donné par les jetons : clair, ou sombre selon le réglage de l'appareil (ADR-009).
    backgrounds: { disable: true },
    // WCAG 2.1 AA bloquant : une violation axe-core fait échouer la story en test (EX-T22.1).
    a11y: { test: 'error', options: { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
    viewport: {
      options: {
        small: { name: '320 px (minimum)', styles: { width: '320px', height: '640px' } },
        mobile: { name: 'Mobile 375 px', styles: { width: '375px', height: '812px' } },
        desktop: { name: 'Bureau 1280 px', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
};

export default preview;
