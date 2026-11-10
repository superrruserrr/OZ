/**
 * Jetons de couleur OZ (design.md §8.3, ADR-009), source unique des valeurs : un jeu clair (défaut)
 * et un jeu sombre (`prefers-color-scheme: dark`), mêmes noms sémantiques. `styles/tokens.css` les
 * pose en variables CSS `--oz-*` ; un test vérifie que les trois restent identiques.
 */
const light = Object.freeze({
  bg: '#F9F9F9',
  'bg-page': '#F9F9F9',
  'surface-1': '#F3F3F1',
  'surface-2': '#F3F3F1',
  'surface-input': '#FFFFFF',
  'surface-ozid': '#F3F3F1',
  'tint-green': '#E4F3E8',
  border: '#E2E2DF',
  text: '#1D1D1B',
  'text-muted': '#5C5C59',
  'text-label': '#5F625E',
  // Sous AA : uniquement pour un texte inactif.
  'text-disabled': '#A3A3A0',
  // Vert de la charte #1E8E3E assombri : AA en petit texte (ADR-009).
  primary: '#187A34',
  'primary-from': '#187A34',
  'primary-to': '#166F33',
  'primary-bright': '#1E8E3E',
  'on-primary': '#FFFFFF',
  // Rose de la charte : titres d'accroche, grand texte sur le fond nu seulement (3:1).
  accent: '#EC5C9F',
  // Turquoise de la charte : pictos et mises en avant, jamais de texte.
  highlight: '#06BAF0',
  // Icônes et grands titres ; le texte bleu utilise `legal-text` (M8).
  legal: '#2B57D9',
  'legal-text': '#2449B8',
  'legal-bg': '#EEF2FD',
  'legal-border': '#C9D5F5',
  kyc: '#8A5A00',
  'kyc-border': '#E8C877',
  danger: '#C5221F',
  admin: '#93560F',
  observer: '#5C5C59',
} as const);

const dark = Object.freeze({
  bg: '#1B161B',
  'bg-page': '#1B161B',
  'surface-1': '#241E23',
  'surface-2': '#31282E',
  'surface-input': '#2A2328',
  'surface-ozid': '#31282E',
  'tint-green': '#1F3A26',
  border: '#3D3339',
  text: '#F3ECEC',
  'text-muted': '#BDB3B7',
  'text-label': '#B3A9AD',
  'text-disabled': '#6B6266',
  primary: '#9FFE91',
  'primary-from': '#9FFE91',
  'primary-to': '#8BEF7D',
  'primary-bright': '#9FFE91',
  'on-primary': '#1D1D1B',
  accent: '#EC5C9F',
  highlight: '#47BDE1',
  legal: '#6B8EF0',
  'legal-text': '#9DB4F7',
  'legal-bg': '#1E2233',
  'legal-border': '#39405A',
  kyc: '#F2BE45',
  'kyc-border': '#5A4A22',
  danger: '#FF7A6E',
  admin: '#E8B06A',
  observer: '#BDB3B7',
} as const satisfies Record<keyof typeof light, string>);

export const OZ_MODES = ['light', 'dark'] as const;
export type OzMode = (typeof OZ_MODES)[number];

export const ozThemes = Object.freeze({ light, dark });

export type OzColor = keyof typeof light;
