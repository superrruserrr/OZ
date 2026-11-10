import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { ozThemes, type OzColor } from '../tokens.js';

// Classes de couleur exposées par tokens.css (`bg-oz-*`, `text-oz-*`…). Le bleu légal n'existe qu'en
// `legal-icon` et `legal-text` (M8) : pas de classe `oz-legal` seule.
const colorNames = [
  ...(Object.keys(ozThemes.light) as OzColor[]).filter((name) => name !== 'legal'),
  'legal-icon',
].map((name) => `oz-${name}`);

const twMerge = extendTailwindMerge({ extend: { theme: { color: colorNames } } });

/** Concatène des classes conditionnelles et résout les conflits Tailwind (la dernière l'emporte). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
