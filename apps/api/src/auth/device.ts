// Libellé d'appareil (lot 1.3b, EX-103 n° 6) : navigateur et système déduits du User-Agent, pris dans
// des listes fermées. Seul ce libellé est conservé et affiché : jamais l'en-tête brut, qui identifie
// davantage (versions, modèle) et peut porter du texte arbitraire.

/** Le premier motif qui correspond l'emporte : Edge et Opera se déclarent aussi « Chrome ». */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\b(?:Macintosh|Mac OS X)\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/** En-tête plus long : ignoré sans analyse (borne le travail des expressions). */
const MAX_USER_AGENT_LENGTH = 512;

/** « Firefox · macOS », « Navigateur inconnu · Android »…, ou NULL si rien n'est reconnu. */
export function deviceLabel(userAgent: string | undefined): string | null {
  if (userAgent === undefined || userAgent.length > MAX_USER_AGENT_LENGTH) return null;
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser === undefined && system === undefined) return null;
  return `${browser ?? 'Navigateur inconnu'} · ${system ?? 'Système inconnu'}`;
}
