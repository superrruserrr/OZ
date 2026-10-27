import { create } from 'storybook/theming';
import { ozColors } from '../src/tokens.js';

/** Thème sombre OZ de l'interface de Storybook et des pages de documentation (design.md §8.3). */
export const ozTheme = create({
  base: 'dark',
  brandTitle: 'OZ · Design system',
  colorPrimary: ozColors.primary,
  colorSecondary: ozColors.primary,
  appBg: ozColors['surface-1'],
  appContentBg: ozColors.bg,
  appPreviewBg: ozColors.bg,
  appBorderColor: ozColors.border,
  appBorderRadius: 12,
  textColor: ozColors.text,
  textMutedColor: ozColors['text-muted'],
  textInverseColor: ozColors['on-primary'],
  barBg: ozColors['surface-1'],
  barTextColor: ozColors['text-muted'],
  barSelectedColor: ozColors.primary,
  inputBg: ozColors['surface-input'],
  inputBorder: ozColors.border,
  inputTextColor: ozColors.text,
  fontBase: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  fontCode: "'JetBrains Mono Variable', ui-monospace, monospace",
});
