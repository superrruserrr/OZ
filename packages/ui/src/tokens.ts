/**
 * Jetons de couleur OZ (design.md §8.3, ADR-009), source unique des valeurs : un jeu clair et un jeu
 * sombre, mêmes noms sémantiques. Depuis ADR-011, le web n'a qu'un thème, sombre (palette noir et
 * lime de l'ADR-012) : `styles/tokens.css`
 * pose le jeu sombre en variables CSS `--oz-*` ; le jeu clair reste ici pour le mobile et l'impression.
 * Un test vérifie que les valeurs restent identiques.
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
  bg: '#0A0D0E',
  'bg-page': '#0A0D0E',
  'surface-1': '#101517',
  'surface-2': '#172023',
  'surface-input': '#0E1315',
  'surface-ozid': '#172023',
  'tint-green': '#1C2A0C',
  border: '#222B2E',
  text: '#F2F5F3',
  'text-muted': '#9AA4A6',
  'text-label': '#8E989A',
  'text-disabled': '#5A6466',
  primary: '#C6FF3D',
  'primary-from': '#C6FF3D',
  'primary-to': '#A8E62A',
  'primary-bright': '#C6FF3D',
  'on-primary': '#0A0D0E',
  accent: '#C6FF3D',
  highlight: '#7AA7FF',
  legal: '#6B8EF0',
  'legal-text': '#9DB4F7',
  'legal-bg': '#111A2B',
  'legal-border': '#2B3756',
  kyc: '#FFD36B',
  'kyc-border': '#5A4A1E',
  danger: '#FF6B5E',
  admin: '#E8B06A',
  observer: '#9AA4A6',
} as const satisfies Record<keyof typeof light, string>);

export const OZ_MODES = ['light', 'dark'] as const;
export type OzMode = (typeof OZ_MODES)[number];

/** Thème servi par le web (ADR-011). */
export const OZ_DEFAULT_MODE: OzMode = 'dark';

export const ozThemes = Object.freeze({ light, dark });

export type OzColor = keyof typeof light;
