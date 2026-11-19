/** Numéro de maillot décoratif, sans lien avec un joueur réel. */
const JERSEY = '10';

/**
 * Illustration du héros du tableau de bord (2026-11-18) : silhouette de joueur de dos, maillot n° 10,
 * sur des bandes diagonales lime. Dessinée pour OZ, sans visage ni photo (EX-T16), décorative.
 * Couleurs par jetons (`currentColor`, `--oz-*`) ; seuls `transform` et `opacity` bougent.
 */
export function HeroIllustration({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 520 320"
      aria-hidden="true"
      className={className}
      fill="none"
      data-testid="dashboard-hero-illustration"
    >
      <defs>
        <linearGradient id="oz-hero-stripe" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--oz-primary)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--oz-primary)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="oz-hero-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--oz-surface-2)" />
          <stop offset="1" stopColor="var(--oz-bg)" />
        </linearGradient>
      </defs>
      <g className="motion-safe:animate-oz-breathe">
        <path d="M180 320 L330 0 H372 L222 320 Z" fill="url(#oz-hero-stripe)" />
        <path d="M250 320 L400 0 H420 L270 320 Z" fill="url(#oz-hero-stripe)" opacity="0.6" />
        <path d="M120 320 L270 0 H282 L132 320 Z" fill="url(#oz-hero-stripe)" opacity="0.35" />
      </g>
      {/* Silhouette de dos : tête, épaules, maillot ; aucun trait de visage. */}
      <g>
        <circle cx="392" cy="70" r="34" fill="url(#oz-hero-body)" stroke="var(--oz-border)" />
        <path
          d="M300 320 C304 220 322 150 352 128 C372 116 412 116 432 128 C462 150 480 220 484 320 Z"
          fill="url(#oz-hero-body)"
          stroke="var(--oz-border)"
        />
        <path
          d="M352 128 C362 140 422 140 432 128"
          stroke="var(--oz-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text
          x="392"
          y="250"
          textAnchor="middle"
          fontSize="96"
          fontWeight="500"
          fill="var(--oz-text)"
          fillOpacity="0.9"
          className="font-sans tracking-tighter"
        >
          {JERSEY}
        </text>
      </g>
    </svg>
  );
}
