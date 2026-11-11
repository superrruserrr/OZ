import { cn } from '../lib/cn.js';

/*
 * Écusson générique de club (lot 1.5da) : bouclier bicolore et initiales, calculé à partir du nom.
 * Jamais le logo réel d'un club (droits des marques, M4) : une organisation vérifiée pourra plus tard
 * téléverser le sien. Couleurs par classes de jetons (pas d'attribut `style`, CSP).
 */

/** Paires de jetons sobres, lisibles sur fond sombre ; aucune couleur en dur (jetons `--oz-*`). */
const PALETTES = [
  { field: 'fill-oz-tint-green', band: 'fill-oz-primary', edge: 'stroke-oz-primary' },
  { field: 'fill-oz-legal-bg', band: 'fill-oz-highlight', edge: 'stroke-oz-highlight' },
  { field: 'fill-oz-surface-2', band: 'fill-oz-kyc', edge: 'stroke-oz-kyc' },
  { field: 'fill-oz-surface-2', band: 'fill-oz-danger', edge: 'stroke-oz-danger' },
  { field: 'fill-oz-surface-2', band: 'fill-oz-text-muted', edge: 'stroke-oz-text-muted' },
  { field: 'fill-oz-surface-1', band: 'fill-oz-admin', edge: 'stroke-oz-admin' },
] as const;

export type CrestPalette = (typeof PALETTES)[number];

/** Couleurs stables pour un même nom (hachage simple, non cryptographique). */
export function crestPalette(name: string): CrestPalette {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return PALETTES[hash % PALETTES.length] ?? PALETTES[0];
}

const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'for', 'of', 'the']);

/** Deux lettres : initiales des deux premiers mots porteurs, sinon les deux premières du nom. */
export function crestInitials(name: string): string {
  const words = name
    .split(/[\s\-']+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  const [first, second] = words;
  if (first && second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  const only = (words[0] ?? name).replace(/[^\p{L}\p{N}]/gu, '');
  return only.slice(0, 2).toUpperCase();
}

export interface ClubCrestProps {
  /** Nom du club ou de l'académie, tel qu'enregistré. */
  name: string;
  /** Texte lu ; par défaut « Écusson générique : <nom> ». */
  label?: string | undefined;
  /** Décoratif quand le nom est déjà écrit à côté. */
  decorative?: boolean | undefined;
  className?: string | undefined;
}

export function ClubCrest({ name, label, decorative = false, className }: ClubCrestProps) {
  const { field, band, edge } = crestPalette(name);
  return (
    <svg
      viewBox="0 0 40 46"
      data-testid="club-crest"
      className={cn('h-10 w-auto shrink-0', className)}
      {...(decorative
        ? { 'aria-hidden': 'true' as const }
        : { role: 'img', 'aria-label': label ?? `Écusson générique : ${name}` })}
    >
      <path
        d="M20 1.5 37.5 7v15.5C37.5 34 29.6 41.2 20 44.5 10.4 41.2 2.5 34 2.5 22.5V7z"
        strokeWidth="1.5"
        className={cn(field, edge)}
      />
      <path d="M2.5 13.5h35v4h-35z" opacity="0.9" className={band} />
      <text
        x="20"
        y="33"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontSize="12"
        fontWeight="500"
        letterSpacing="0.5"
        className="fill-oz-text"
      >
        {crestInitials(name)}
      </text>
    </svg>
  );
}
