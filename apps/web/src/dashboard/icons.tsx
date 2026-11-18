import type { ReactNode } from 'react';

/* Pictogrammes au trait des cartes du tableau de bord (lot 1.5ec), décoratifs. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const DASHBOARD_ICONS = {
  video: (
    <Glyph>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </Glyph>
  ),
  message: (
    <Glyph>
      <path d="M4 5h16v11H9l-5 4z" />
    </Glyph>
  ),
  eye: (
    <Glyph>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  ),
  toggle: (
    <Glyph>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="16" cy="12" r="3" />
    </Glyph>
  ),
  download: (
    <Glyph>
      <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
    </Glyph>
  ),
  trash: (
    <Glyph>
      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
    </Glyph>
  ),
  stopwatch: (
    <Glyph>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M10 2h4" />
    </Glyph>
  ),
  bell: (
    <Glyph>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
    </Glyph>
  ),
  file: (
    <Glyph>
      <path d="M6 3h8l4 4v14H6zM14 3v4h4" />
    </Glyph>
  ),
} as const;
