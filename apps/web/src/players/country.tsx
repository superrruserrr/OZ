import * as Flags from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGAttributes } from 'react';

const FLAGS = Flags as unknown as Readonly<
  Record<string, ComponentType<SVGAttributes<SVGSVGElement>> | undefined>
>;

/** Nom du pays dans la langue de l'écran (`Intl.DisplayNames`), le code à défaut. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Drapeau SVG servi par le site (lot 1.5dc, `country-flag-icons`, MIT) : aucune requête vers un tiers,
 * aucun attribut `style` (CSP). Décoratif : le nom du pays est toujours écrit à côté.
 */
export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const Flag = /^[A-Z]{2}$/.test(code) ? FLAGS[code] : undefined;
  if (!Flag) return null;
  return (
    <Flag
      aria-hidden="true"
      data-testid={`flag-${code}`}
      className={className ?? 'h-4 w-6 shrink-0 rounded-[3px] ring-1 ring-oz-border'}
    />
  );
}
