import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Kit de cadres (lot 1.5cc, ADR-012) : cadre média aux formats standard et emplacement publicitaire.
 * Le cadre garde son ratio à toute largeur ; sans image, il montre un repli hachuré décoratif.
 * Aucun script tiers : une régie publicitaire demandera son propre ADR (consentement, CSP).
 */

const RATIOS = {
  '4:5': 'aspect-[4/5]',
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
} as const;
export type MediaRatio = keyof typeof RATIOS;

const PLACEHOLDER =
  'bg-[repeating-linear-gradient(135deg,var(--oz-surface-2)_0_12px,var(--oz-surface-1)_12px_24px)]';

export interface MediaFrameProps {
  ratio: MediaRatio;
  /** Image ou vidéo (`<img alt>` fourni par l'appelant) ; repli hachuré sinon. */
  children?: ReactNode | undefined;
  /** Texte posé en bas du cadre, sur un dégradé qui garde le contraste (nom, numéro…). */
  overlay?: ReactNode | undefined;
  /** Pastille en haut à gauche (numéro de maillot, « À la une »). */
  tag?: ReactNode | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

export function MediaFrame({
  ratio,
  children,
  overlay,
  tag,
  testId = 'media-frame',
  className,
}: MediaFrameProps) {
  return (
    <div
      data-testid={testId}
      data-ratio={ratio}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-oz-border',
        RATIOS[ratio],
        children ? 'bg-oz-surface-1' : PLACEHOLDER,
        className,
      )}
    >
      {children ? (
        <div className="absolute inset-0 [&>img]:size-full [&>img]:object-cover [&>video]:size-full [&>video]:object-cover">
          {children}
        </div>
      ) : null}
      {overlay ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-oz-bg to-transparent"
          />
          <div className="absolute inset-x-4 bottom-4 text-oz-text">{overlay}</div>
        </>
      ) : null}
      {tag ? (
        <span className="absolute top-3 left-3 rounded-md bg-oz-primary px-2 py-1 text-[11px] font-medium tracking-[0.08em] text-oz-on-primary uppercase">
          {tag}
        </span>
      ) : null}
    </div>
  );
}

const AD_FORMATS = {
  leaderboard: { box: 'aspect-[728/90] max-w-[728px]', size: '728 × 90' },
  mpu: { box: 'aspect-[300/250] max-w-[300px]', size: '300 × 250' },
  mobile: { box: 'aspect-[320/100] max-w-[320px]', size: '320 × 100' },
} as const;
export type AdFormat = keyof typeof AD_FORMATS;

export interface AdSlotProps {
  format: AdFormat;
  /** Mention obligatoire, déjà traduite (« Sponsorisé »). */
  sponsoredLabel: string;
  /** Création de l'annonceur (image avec `alt`, lien) ; repli neutre sinon. */
  children?: ReactNode | undefined;
  /** Texte du repli, déjà traduit (« Espace partenaire »). */
  placeholder?: string | undefined;
  className?: string | undefined;
}

/** Emplacement publicitaire IAB, toujours marqué ; jamais de code tiers exécuté. */
export function AdSlot({ format, sponsoredLabel, children, placeholder, className }: AdSlotProps) {
  const { box, size } = AD_FORMATS[format];
  return (
    <aside
      aria-label={sponsoredLabel}
      data-testid="ad-slot"
      data-format={format}
      className={cn(
        'relative grid w-full place-items-center overflow-hidden rounded-xl border border-dashed border-oz-border bg-oz-surface-1',
        box,
        className,
      )}
    >
      <span className="absolute top-1.5 left-2.5 text-[10px] font-medium tracking-[0.12em] text-oz-text-label uppercase">
        {sponsoredLabel}
      </span>
      {children ?? <span className="text-sm text-oz-text-label">{placeholder ?? size}</span>}
    </aside>
  );
}
