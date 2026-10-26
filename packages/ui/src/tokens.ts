/**
 * Jetons de couleur OZ (design.md §8.3), source unique des valeurs. `styles/tokens.css` les pose en
 * variables CSS `--oz-*` ; un test vérifie que les deux restent identiques au bloc de design.md.
 */
export const ozColors = Object.freeze({
  bg: '#070707',
  'bg-page': '#090909',
  'surface-1': '#0C0E0D',
  'surface-2': '#10120F',
  'surface-input': '#171C16',
  'surface-ozid': '#141E16',
  'tint-green': '#0D2517',
  border: '#1E2221',
  text: '#F2F4F1',
  'text-muted': '#8C8E8B',
  'text-label': '#818680',
  // Sous AA : uniquement pour un texte inactif.
  'text-disabled': '#4A4F49',
  primary: '#35D468',
  'primary-from': '#3BE06A',
  'primary-to': '#2CC45A',
  'primary-bright': '#49E86F',
  'on-primary': '#06120A',
  // Registre Émotion seulement (design.md §8.2).
  lime: '#81F000',
  // Icônes et grands titres ; le texte bleu utilise `legal-text` (M8).
  legal: '#3B64F1',
  'legal-text': '#6B8EF0',
  'legal-bg': '#0A111C',
  'legal-border': '#222A37',
  kyc: '#C89137',
  'kyc-border': '#3F3923',
  danger: '#E5484D',
  admin: '#D29847',
  observer: '#8C8E8B',
} as const);

export type OzColor = keyof typeof ozColors;
