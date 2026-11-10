import { cn } from '../lib/cn.js';

/*
 * Logo OZ Football ID (charte v1.0, ADR-009, design.md §8.5) : jamais recomposé en texte. Version
 * horizontale sur grand écran, empilée sous 640 px ; version fond sombre selon le réglage de
 * l'appareil. Choix fait par le navigateur (`<picture>`), sans JavaScript ni flash au chargement.
 */
export const LOGO_FILES = {
  horizontal: {
    light: 'oz-logo-horizontal-fond-clair.png',
    dark: 'oz-logo-horizontal-fond-sombre.png',
    width: 480,
    height: 148,
  },
  stacked: {
    light: 'oz-logo-empile-fond-clair.png',
    dark: 'oz-logo-empile-fond-sombre.png',
    width: 300,
    height: 234,
  },
} as const;

const NARROW = '(max-width: 639px)';
const DARK = '(prefers-color-scheme: dark)';

export interface LogoProps {
  /** Texte alternatif traduit ; vide si un texte voisin nomme déjà la marque. */
  alt: string;
  /** Dossier public des fichiers du logo. */
  basePath?: string;
  className?: string;
}

export function Logo({ alt, basePath = '/brand', className }: LogoProps) {
  const { horizontal, stacked } = LOGO_FILES;
  const url = (file: string) => `${basePath}/${file}`;
  return (
    <picture data-testid="oz-logo">
      <source
        media={`${NARROW} and ${DARK}`}
        srcSet={url(stacked.dark)}
        width={stacked.width}
        height={stacked.height}
      />
      <source
        media={NARROW}
        srcSet={url(stacked.light)}
        width={stacked.width}
        height={stacked.height}
      />
      <source
        media={DARK}
        srcSet={url(horizontal.dark)}
        width={horizontal.width}
        height={horizontal.height}
      />
      <img
        src={url(horizontal.light)}
        alt={alt}
        width={horizontal.width}
        height={horizontal.height}
        decoding="async"
        className={cn('block h-14 w-auto max-sm:h-16', className)}
      />
    </picture>
  );
}
