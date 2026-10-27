/** Échecs consécutifs tolérés sans délai : dès le 3e, la tentative suivante attend. */
export const BACKOFF_FREE_FAILURES = 3;
/** Plafond du délai : 15 min, jamais de verrouillage définitif (EX-103 n° 8). */
export const BACKOFF_MAX_SECONDS = 900;

/** Délai imposé, en secondes, avant la prochaine tentative après `failures` échecs consécutifs. */
export function backoffSeconds(failures: number): number {
  const count = Math.floor(failures);
  if (!(count >= BACKOFF_FREE_FAILURES)) return 0;
  const exponent = count - BACKOFF_FREE_FAILURES;
  // 2^10 = 1024 > 900 : inutile de calculer au-delà (et 2^n déborde vers l'infini).
  return exponent >= 10 ? BACKOFF_MAX_SECONDS : Math.min(2 ** exponent, BACKOFF_MAX_SECONDS);
}
