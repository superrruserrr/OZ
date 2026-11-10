import { create } from 'storybook/theming';
import { ozThemes } from '../src/tokens.js';

const ozColors = ozThemes.light;

/** Thème clair OZ (défaut de la charte, ADR-009) de l'interface de Storybook et de la documentation. */
export const ozTheme = create({
  base: 'light',
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
  fontBase: "'Prompt', ui-sans-serif, system-ui, sans-serif",
  fontCode: "'JetBrains Mono Variable', ui-monospace, monospace",
});
